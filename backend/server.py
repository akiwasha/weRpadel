from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Header
from fastapi.responses import Response
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import bcrypt
import jwt
import requests
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timedelta, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "padelconnect"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI()
api_router = APIRouter(prefix="/api")
logger = logging.getLogger("padelconnect")
logging.basicConfig(level=logging.INFO)

storage_key: Optional[str] = None

def init_storage() -> Optional[str]:
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_LLM_KEY:
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        return storage_key
    except Exception as e:
        logger.warning(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(500, "Storage unavailable")
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(500, "Storage unavailable")
    resp = requests.get(f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code >= 400:
        raise HTTPException(404, "File not found")
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ============ MODELS ============
LEVELS = ["Débutant", "Intermédiaire", "Confirmé", "Expert"]

class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)
    pseudo: str = Field(min_length=2, max_length=30)

class LoginInput(BaseModel):
    email: EmailStr
    password: str

class UserPublic(BaseModel):
    id: str
    pseudo: str
    avatar_url: Optional[str] = None
    level: str
    reliability_avg: float
    reliability_count: int
    bio: Optional[str] = None

class UserMe(UserPublic):
    email: EmailStr

class ProfileUpdate(BaseModel):
    pseudo: Optional[str] = None
    avatar_url: Optional[str] = None
    level: Optional[str] = None
    bio: Optional[str] = None

class ClubOut(BaseModel):
    id: str
    name: str
    city: str
    region: str
    address: Optional[str] = None
    image_url: Optional[str] = None
    approved: bool
    announcements_count: int = 0

class ClubCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    city: str = Field(min_length=2, max_length=60)
    region: str = Field(min_length=2, max_length=60)
    address: Optional[str] = None

class AnnouncementCreate(BaseModel):
    content: str = Field(min_length=1, max_length=500)
    availability: Optional[str] = None

class AnnouncementOut(BaseModel):
    id: str
    club_id: str
    author: UserPublic
    content: str
    availability: Optional[str] = None
    created_at: str

class MessageCreate(BaseModel):
    to_user_id: str
    content: str = Field(min_length=1, max_length=1000)

class MessageOut(BaseModel):
    id: str
    from_user_id: str
    to_user_id: str
    content: str
    created_at: str
    read: bool

class ConversationOut(BaseModel):
    other_user: UserPublic
    last_message: str
    last_at: str
    unread: int

class RatingInput(BaseModel):
    stars: int = Field(ge=1, le=5)

# ============ AUTH HELPERS ============
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=12)).decode()

def check_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def make_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=30)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

async def current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    token = authorization[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        user_id = payload["sub"]
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user

def user_public(u: dict) -> dict:
    return {
        "id": u["id"],
        "pseudo": u.get("pseudo", ""),
        "avatar_url": u.get("avatar_url"),
        "level": u.get("level", "Débutant"),
        "reliability_avg": round(u.get("reliability_sum", 0) / u["reliability_count"], 1) if u.get("reliability_count", 0) > 0 else 0.0,
        "reliability_count": u.get("reliability_count", 0),
        "bio": u.get("bio"),
    }

# ============ AUTH ROUTES ============
@api_router.post("/auth/register")
async def register(body: RegisterInput):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Email déjà utilisé")
    if await db.users.find_one({"pseudo_lower": body.pseudo.lower()}):
        raise HTTPException(409, "Pseudo déjà pris")
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": email,
        "pseudo": body.pseudo,
        "pseudo_lower": body.pseudo.lower(),
        "password_hash": hash_pw(body.password),
        "avatar_url": None,
        "level": "Débutant",
        "bio": None,
        "reliability_sum": 0,
        "reliability_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    token = make_token(user_id)
    return {"token": token, "user": {**user_public(user), "email": email}}

@api_router.post("/auth/login")
async def login(body: LoginInput):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not check_pw(body.password, user["password_hash"]):
        raise HTTPException(401, "Email ou mot de passe incorrect")
    token = make_token(user["id"])
    return {"token": token, "user": {**user_public(user), "email": user["email"]}}

@api_router.get("/auth/me")
async def me(user=Depends(current_user)):
    return {**user_public(user), "email": user["email"]}

@api_router.put("/auth/me")
async def update_me(body: ProfileUpdate, user=Depends(current_user)):
    updates = {}
    if body.pseudo and body.pseudo != user["pseudo"]:
        if await db.users.find_one({"pseudo_lower": body.pseudo.lower(), "id": {"$ne": user["id"]}}):
            raise HTTPException(409, "Pseudo déjà pris")
        updates["pseudo"] = body.pseudo
        updates["pseudo_lower"] = body.pseudo.lower()
    if body.level:
        if body.level not in LEVELS:
            raise HTTPException(400, "Niveau invalide")
        updates["level"] = body.level
    if body.avatar_url is not None:
        updates["avatar_url"] = body.avatar_url
    if body.bio is not None:
        updates["bio"] = body.bio
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    updated = await db.users.find_one({"id": user["id"]})
    return {**user_public(updated), "email": updated["email"]}

# ============ USERS ============
@api_router.get("/users/{user_id}")
async def get_user(user_id: str, _=Depends(current_user)):
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(404, "Utilisateur introuvable")
    return user_public(u)

@api_router.post("/users/{user_id}/rate")
async def rate_user(user_id: str, body: RatingInput, user=Depends(current_user)):
    if user_id == user["id"]:
        raise HTTPException(400, "Impossible de se noter soi-même")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "Utilisateur introuvable")
    existing = await db.ratings.find_one({"from_user": user["id"], "to_user": user_id})
    if existing:
        delta = body.stars - existing["stars"]
        await db.ratings.update_one({"_id": existing["_id"]}, {"$set": {"stars": body.stars}})
        await db.users.update_one({"id": user_id}, {"$inc": {"reliability_sum": delta}})
    else:
        await db.ratings.insert_one({
            "id": str(uuid.uuid4()),
            "from_user": user["id"],
            "to_user": user_id,
            "stars": body.stars,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.users.update_one({"id": user_id}, {"$inc": {"reliability_sum": body.stars, "reliability_count": 1}})
    updated = await db.users.find_one({"id": user_id})
    return user_public(updated)

# ============ CLUBS ============
@api_router.get("/clubs")
async def list_clubs(search: Optional[str] = None, region: Optional[str] = None, user=Depends(current_user)):
    # Show approved clubs to everyone + user's own pending suggestions
    q = {"$or": [{"approved": True}, {"suggested_by": user["id"]}]}
    if region:
        q = {"$and": [q, {"region": region}]}
    if search:
        search_q = {"$or": [
            {"name": {"$regex": search, "$options": "i"}},
            {"city": {"$regex": search, "$options": "i"}},
        ]}
        q = {"$and": [q, search_q]} if not region else {"$and": q["$and"] + [search_q]}
    clubs = await db.clubs.find(q, {"_id": 0}).to_list(500)
    # attach announcement count
    for c in clubs:
        c["announcements_count"] = await db.announcements.count_documents({"club_id": c["id"]})
    return clubs

@api_router.get("/clubs/regions")
async def list_regions(_=Depends(current_user)):
    regions = await db.clubs.distinct("region", {"approved": True})
    return sorted(regions)

@api_router.get("/clubs/{club_id}")
async def get_club(club_id: str, _=Depends(current_user)):
    c = await db.clubs.find_one({"id": club_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Club introuvable")
    c["announcements_count"] = await db.announcements.count_documents({"club_id": club_id})
    return c

@api_router.post("/clubs")
async def suggest_club(body: ClubCreate, user=Depends(current_user)):
    club_id = str(uuid.uuid4())
    club = {
        "id": club_id,
        "name": body.name,
        "city": body.city,
        "region": body.region,
        "address": body.address,
        "image_url": None,
        "approved": False,  # awaiting moderation, but list to author
        "suggested_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.clubs.insert_one(club)
    club.pop("_id", None)
    club["announcements_count"] = 0
    return club

# ============ ANNOUNCEMENTS (Group Chat per Club) ============
@api_router.get("/clubs/{club_id}/announcements")
async def list_announcements(club_id: str, _=Depends(current_user)):
    club = await db.clubs.find_one({"id": club_id})
    if not club:
        raise HTTPException(404, "Club introuvable")
    items = await db.announcements.find({"club_id": club_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    # enrich with author
    out = []
    for a in items:
        author = await db.users.find_one({"id": a["author_id"]})
        if author:
            out.append({
                "id": a["id"],
                "club_id": a["club_id"],
                "author": user_public(author),
                "content": a["content"],
                "availability": a.get("availability"),
                "created_at": a["created_at"],
            })
    return out

@api_router.post("/clubs/{club_id}/announcements")
async def create_announcement(club_id: str, body: AnnouncementCreate, user=Depends(current_user)):
    club = await db.clubs.find_one({"id": club_id})
    if not club:
        raise HTTPException(404, "Club introuvable")
    ann_id = str(uuid.uuid4())
    ann = {
        "id": ann_id,
        "club_id": club_id,
        "author_id": user["id"],
        "content": body.content,
        "availability": body.availability,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.announcements.insert_one(ann)
    return {
        "id": ann_id,
        "club_id": club_id,
        "author": user_public(user),
        "content": body.content,
        "availability": body.availability,
        "created_at": ann["created_at"],
    }

# ============ MESSAGES (Private DM) ============
def conv_id(a: str, b: str) -> str:
    return "|".join(sorted([a, b]))

@api_router.get("/messages/conversations")
async def list_conversations(user=Depends(current_user)):
    # aggregate distinct partners
    pipeline = [
        {"$match": {"$or": [{"from_user_id": user["id"]}, {"to_user_id": user["id"]}]}},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$conv_id",
            "last": {"$first": "$$ROOT"},
        }},
    ]
    convs = await db.messages.aggregate(pipeline).to_list(200)
    out = []
    for c in convs:
        last = c["last"]
        other_id = last["to_user_id"] if last["from_user_id"] == user["id"] else last["from_user_id"]
        other = await db.users.find_one({"id": other_id})
        if not other:
            continue
        unread = await db.messages.count_documents({
            "conv_id": conv_id(user["id"], other_id),
            "to_user_id": user["id"],
            "read": False,
        })
        out.append({
            "other_user": user_public(other),
            "last_message": last["content"],
            "last_at": last["created_at"],
            "unread": unread,
        })
    out.sort(key=lambda x: x["last_at"], reverse=True)
    return out

@api_router.get("/messages/{other_id}")
async def get_conversation(other_id: str, user=Depends(current_user)):
    cid = conv_id(user["id"], other_id)
    msgs = await db.messages.find({"conv_id": cid}, {"_id": 0}).sort("created_at", 1).to_list(500)
    # mark as read those to me
    await db.messages.update_many(
        {"conv_id": cid, "to_user_id": user["id"], "read": False},
        {"$set": {"read": True}},
    )
    return msgs

@api_router.post("/messages")
async def send_message(body: MessageCreate, user=Depends(current_user)):
    if body.to_user_id == user["id"]:
        raise HTTPException(400, "Impossible de s'écrire à soi-même")
    target = await db.users.find_one({"id": body.to_user_id})
    if not target:
        raise HTTPException(404, "Destinataire introuvable")
    msg = {
        "id": str(uuid.uuid4()),
        "conv_id": conv_id(user["id"], body.to_user_id),
        "from_user_id": user["id"],
        "to_user_id": body.to_user_id,
        "content": body.content,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.messages.insert_one(msg)
    msg.pop("_id", None)
    return msg

# ============ AVATAR UPLOAD ============
@api_router.post("/upload/avatar")
async def upload_avatar(file: UploadFile = File(...), user=Depends(current_user)):
    ext = (file.filename or "img.jpg").split(".")[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp", "heic", "heif"):
        ext = "jpg"
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    ct = file.content_type or "image/jpeg"
    await run_in_threadpool(put_object, path, data, ct)
    avatar_url = f"/api/files/{path}"
    await db.users.update_one({"id": user["id"]}, {"$set": {"avatar_url": avatar_url}})
    return {"avatar_url": avatar_url}

@api_router.get("/files/{path:path}")
async def get_file(path: str):
    content, ct = await run_in_threadpool(get_object, path)
    return Response(content=content, media_type=ct)

# ============ SEED ============
DEMO_CLUBS = [
    {"name": "Padel Horizon Paris", "city": "Paris", "region": "Île-de-France", "address": "12 rue du Padel, 75015 Paris", "image_url": "https://images.unsplash.com/photo-1658723826297-fe4d1b1e6600?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"},
    {"name": "Club Padel Lyon Est", "city": "Lyon", "region": "Auvergne-Rhône-Alpes", "address": "45 avenue des Sports, 69003 Lyon", "image_url": "https://images.pexels.com/photos/31012869/pexels-photo-31012869.jpeg?auto=compress&cs=tinysrgb&w=800"},
    {"name": "Marseille Padel Beach", "city": "Marseille", "region": "Provence-Alpes-Côte d'Azur", "address": "8 corniche Kennedy, 13007 Marseille", "image_url": "https://images.unsplash.com/photo-1658723826297-fe4d1b1e6600?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"},
    {"name": "Padel Toulouse Sud", "city": "Toulouse", "region": "Occitanie", "address": "22 chemin des Sports, 31400 Toulouse", "image_url": "https://images.pexels.com/photos/31012869/pexels-photo-31012869.jpeg?auto=compress&cs=tinysrgb&w=800"},
    {"name": "Bordeaux Padel Arena", "city": "Bordeaux", "region": "Nouvelle-Aquitaine", "address": "3 quai des Chartrons, 33000 Bordeaux", "image_url": "https://images.unsplash.com/photo-1658723826297-fe4d1b1e6600?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"},
    {"name": "Nice Padel Club", "city": "Nice", "region": "Provence-Alpes-Côte d'Azur", "address": "17 promenade des Anglais, 06000 Nice", "image_url": "https://images.pexels.com/photos/31012869/pexels-photo-31012869.jpeg?auto=compress&cs=tinysrgb&w=800"},
    {"name": "Padel Nantes Erdre", "city": "Nantes", "region": "Pays de la Loire", "address": "5 boulevard des Poilus, 44000 Nantes", "image_url": "https://images.unsplash.com/photo-1658723826297-fe4d1b1e6600?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"},
    {"name": "Strasbourg Padel", "city": "Strasbourg", "region": "Grand Est", "address": "9 rue de la Paix, 67000 Strasbourg", "image_url": "https://images.pexels.com/photos/31012869/pexels-photo-31012869.jpeg?auto=compress&cs=tinysrgb&w=800"},
    {"name": "Lille Padel Nord", "city": "Lille", "region": "Hauts-de-France", "address": "14 rue Nationale, 59000 Lille", "image_url": "https://images.unsplash.com/photo-1658723826297-fe4d1b1e6600?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"},
    {"name": "Rennes Padel Ouest", "city": "Rennes", "region": "Bretagne", "address": "2 place de la République, 35000 Rennes", "image_url": "https://images.pexels.com/photos/31012869/pexels-photo-31012869.jpeg?auto=compress&cs=tinysrgb&w=800"},
    {"name": "Montpellier Padel Sud", "city": "Montpellier", "region": "Occitanie", "address": "18 rue de la Loge, 34000 Montpellier", "image_url": "https://images.unsplash.com/photo-1658723826297-fe4d1b1e6600?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"},
    {"name": "Padel Grenoble Alpes", "city": "Grenoble", "region": "Auvergne-Rhône-Alpes", "address": "6 avenue Alsace-Lorraine, 38000 Grenoble", "image_url": "https://images.pexels.com/photos/31012869/pexels-photo-31012869.jpeg?auto=compress&cs=tinysrgb&w=800"},
]

@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("pseudo_lower")
    await db.clubs.create_index("id", unique=True)
    await db.messages.create_index("conv_id")
    await db.messages.create_index([("from_user_id", 1), ("to_user_id", 1)])

    # seed clubs
    if await db.clubs.count_documents({}) == 0:
        for c in DEMO_CLUBS:
            await db.clubs.insert_one({
                "id": str(uuid.uuid4()),
                "approved": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                **c,
            })
        logger.info(f"Seeded {len(DEMO_CLUBS)} clubs")

    # seed demo users
    AV_M = "https://images.unsplash.com/photo-1637071692126-d0ee7df18271?w=300"
    AV_F = "https://images.unsplash.com/photo-1595435742656-5272d0b3fa82?w=300"
    if await db.users.count_documents({}) == 0:
        demo_users = [
            {"email": "marc@padel.fr", "pseudo": "MarcPadel", "level": "Intermédiaire", "avatar": AV_M, "sum": 22, "count": 5, "bio": "Je joue tous les week-ends, ambiance détendue !"},
            {"email": "julie@padel.fr", "pseudo": "JulieSmash", "level": "Confirmé", "avatar": AV_F, "sum": 28, "count": 6, "bio": "Compétitrice mais fair-play. Toujours partante pour un match."},
            {"email": "thomas@padel.fr", "pseudo": "ThomasR", "level": "Débutant", "avatar": AV_M, "sum": 8, "count": 2, "bio": "Débute le padel, cherche des joueurs patients."},
            {"email": "sophie@padel.fr", "pseudo": "SophiePad", "level": "Confirmé", "avatar": AV_F, "sum": 19, "count": 4, "bio": None},
            {"email": "kevin@padel.fr", "pseudo": "KevinAce", "level": "Expert", "avatar": AV_M, "sum": 24, "count": 5, "bio": "Ancien tennisman reconverti au padel."},
            {"email": "lea@padel.fr", "pseudo": "LeaVolley", "level": "Intermédiaire", "avatar": AV_F, "sum": 14, "count": 3, "bio": "Dispo en soirée et le samedi matin."},
        ]
        for u in demo_users:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": u["email"],
                "pseudo": u["pseudo"],
                "pseudo_lower": u["pseudo"].lower(),
                "password_hash": hash_pw("password123"),
                "avatar_url": u["avatar"],
                "level": u["level"],
                "bio": u["bio"],
                "reliability_sum": u["sum"],
                "reliability_count": u["count"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        logger.info(f"Seeded {len(demo_users)} demo users")

    # seed demo announcements across clubs
    if await db.announcements.count_documents({}) == 0:
        all_users = await db.users.find({}).to_list(50)
        all_clubs = await db.clubs.find({"approved": True}).to_list(50)
        if all_users and all_clubs:
            texts = [
                ("Je cherche un partenaire pour un double ce week-end, niveau sympa et détendu !", "Samedi 14h-16h"),
                ("Il nous manque 1 joueur pour compléter notre partie. Qui est chaud ?", "Dimanche 10h"),
                ("Envie de progresser, je cherche des joueurs réguliers pour jouer en semaine.", "Mardi & Jeudi soir"),
                ("Match amical ce soir, terrain réservé, il manque un joueur !", "Ce soir 19h"),
                ("Débutant motivé cherche à jouer avec des joueurs bienveillants 🙂", "Flexible en journée"),
                ("On monte une équipe pour un petit tournoi interne, rejoignez-nous !", "Weekend prochain"),
            ]
            import random
            seeded = 0
            # put 1-2 announcements in the first 6 clubs
            for i, club in enumerate(all_clubs[:6]):
                for _ in range(random.randint(1, 2)):
                    author = random.choice(all_users)
                    txt, avail = random.choice(texts)
                    await db.announcements.insert_one({
                        "id": str(uuid.uuid4()),
                        "club_id": club["id"],
                        "author_id": author["id"],
                        "content": txt,
                        "availability": avail,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    })
                    seeded += 1
            logger.info(f"Seeded {seeded} demo announcements")

    # init storage in background
    try:
        await run_in_threadpool(init_storage)
    except Exception:
        pass

@api_router.get("/")
async def root():
    return {"message": "PadelConnect API", "status": "ok"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
