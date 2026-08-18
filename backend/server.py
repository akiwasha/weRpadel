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
import httpx
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timedelta, timezone
try:
    from zoneinfo import ZoneInfo
    PARIS_TZ = ZoneInfo("Europe/Paris")
except Exception:
    PARIS_TZ = timezone.utc

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

# ---- Emergent Push (SuprSend relay) ----
PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
push_client = httpx.AsyncClient(base_url=PUSH_BASE_URL, headers={"X-Push-Key": PUSH_KEY}, timeout=10.0)

ADMIN_EMAILS = set(e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip())
def is_admin_user(u: dict) -> bool:
    return (u.get("email") or "").lower() in ADMIN_EMAILS

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
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    phone: str = Field(min_length=6, max_length=32)
    birth_date: str = Field(min_length=4, max_length=10)  # YYYY-MM-DD
    city: str = Field(min_length=1, max_length=80)

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
    verified: bool = False
    is_favorite: bool = False
    bio: Optional[str] = None

class UserMe(UserPublic):
    email: EmailStr
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[str] = None
    city: Optional[str] = None

class ProfileUpdate(BaseModel):
    pseudo: Optional[str] = None
    avatar_url: Optional[str] = None
    level: Optional[str] = None
    bio: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[str] = None
    city: Optional[str] = None
    preferred_region: Optional[str] = None

class ClubOut(BaseModel):
    id: str
    name: str
    city: str
    region: str
    address: Optional[str] = None
    image_url: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    price_per_hour: Optional[float] = None
    is_outdoor: bool = False
    approved: bool
    announcements_count: int = 0

class ClubCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    city: str = Field(min_length=2, max_length=60)
    region: str = Field(min_length=2, max_length=60)
    address: Optional[str] = None
    price_per_hour: Optional[float] = Field(default=None, ge=0, le=200)

class AnnouncementCreate(BaseModel):
    content: str = Field(min_length=1, max_length=500)
    availability: Optional[str] = None
    match_date: Optional[str] = None  # ISO datetime de début du match
    match_end_date: Optional[str] = None  # ISO datetime de fin du match
    court_price: Optional[float] = Field(default=None, ge=0, le=500)
    party_size: int = Field(default=1, ge=1, le=4)
    offline_names: List[str] = Field(default_factory=list)

class ReplayInput(BaseModel):
    match_date: Optional[str] = None
    match_end_date: Optional[str] = None
    court_price: Optional[float] = Field(default=None, ge=0, le=500)

class AnnouncementOut(BaseModel):
    id: str
    club_id: str
    club_name: Optional[str] = None
    author: UserPublic
    content: str
    availability: Optional[str] = None
    match_date: Optional[str] = None
    match_end_date: Optional[str] = None
    court_price: Optional[float] = None
    status: str = "undated"  # upcoming | ongoing | past | undated
    created_at: str
    players: List[UserPublic] = []
    offline_players: List[str] = []
    offline_count: int = 0
    total_players: int = 1
    max_players: int = 4
    slots_left: int = 3
    is_full: bool = False
    is_member: bool = False
    is_author: bool = False
    can_rate: bool = False
    has_rated: bool = False
    reminders_muted: bool = False

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

class RegisterPushBody(BaseModel):
    user_id: str
    platform: str  # "android" | "ios"
    device_token: str

class PlayerRating(BaseModel):
    user_id: str
    stars: int = Field(ge=1, le=5)

class MatchRatingInput(BaseModel):
    ratings: List[PlayerRating] = Field(default_factory=list)

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

def user_public(u: dict, viewer: Optional[dict] = None) -> dict:
    count = u.get("reliability_count", 0)
    avg = round(u.get("reliability_sum", 0) / count, 1) if count > 0 else 0.0
    is_fav = False
    if viewer:
        is_fav = u["id"] in (viewer.get("favorites") or [])
    return {
        "id": u["id"],
        "pseudo": u.get("pseudo", ""),
        "avatar_url": u.get("avatar_url"),
        "level": u.get("level", "Débutant"),
        "reliability_avg": avg,
        "reliability_count": count,
        "verified": avg >= 4.5 and count >= 5,
        "is_favorite": is_fav,
        "bio": u.get("bio"),
    }

def user_me(u: dict) -> dict:
    # Private view for the authenticated user only (never exposed publicly)
    return {
        **user_public(u),
        "email": u["email"],
        "first_name": u.get("first_name"),
        "last_name": u.get("last_name"),
        "phone": u.get("phone"),
        "birth_date": u.get("birth_date"),
        "city": u.get("city"),
        "preferred_region": u.get("preferred_region"),
        "is_admin": is_admin_user(u),
    }

def match_status(match_date: Optional[str], match_end_date: Optional[str] = None) -> str:
    if not match_date:
        return "undated"
    try:
        dt = datetime.fromisoformat(match_date.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    except Exception:
        return "undated"
    end = None
    if match_end_date:
        try:
            end = datetime.fromisoformat(match_end_date.replace("Z", "+00:00"))
            if end.tzinfo is None:
                end = end.replace(tzinfo=timezone.utc)
        except Exception:
            end = None
    if end is None:
        end = dt + timedelta(hours=2)
    now = datetime.now(timezone.utc)
    if now < dt:
        return "upcoming"
    if dt <= now <= end:
        return "ongoing"
    return "past"

# ============ WEATHER (Open-Meteo, no API key) ============
# WMO weather code -> (French label, Ionicons name)
WMO_CODES = {
    0: ("Ciel dégagé", "sunny"),
    1: ("Plutôt dégagé", "partly-sunny"),
    2: ("Partiellement nuageux", "partly-sunny"),
    3: ("Couvert", "cloudy"),
    45: ("Brouillard", "cloudy"),
    48: ("Brouillard givrant", "cloudy"),
    51: ("Bruine légère", "rainy"),
    53: ("Bruine", "rainy"),
    55: ("Bruine dense", "rainy"),
    56: ("Bruine verglaçante", "rainy"),
    57: ("Bruine verglaçante", "rainy"),
    61: ("Pluie faible", "rainy"),
    63: ("Pluie", "rainy"),
    65: ("Forte pluie", "rainy"),
    66: ("Pluie verglaçante", "rainy"),
    67: ("Pluie verglaçante", "rainy"),
    71: ("Neige faible", "snow"),
    73: ("Neige", "snow"),
    75: ("Forte neige", "snow"),
    77: ("Grains de neige", "snow"),
    80: ("Averses", "rainy"),
    81: ("Averses", "rainy"),
    82: ("Fortes averses", "rainy"),
    85: ("Averses de neige", "snow"),
    86: ("Averses de neige", "snow"),
    95: ("Orage", "thunderstorm"),
    96: ("Orage, grêle", "thunderstorm"),
    99: ("Orage, grêle", "thunderstorm"),
}

import math

async def geocode_city(name: str) -> Optional[dict]:
    """Resolve a French city/place name to coordinates via Open-Meteo geocoding (no key)."""
    if not name or not name.strip():
        return None
    url = "https://geocoding-api.open-meteo.com/v1/search"
    params = {"name": name.strip(), "count": 1, "language": "fr", "country": "FR"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            resp = await c.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning(f"Geocoding failed: {e}")
        return None
    results = data.get("results") or []
    if not results:
        return None
    r = results[0]
    return {"name": r.get("name"), "lat": r.get("latitude"), "lon": r.get("longitude")}

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))

async def fetch_forecast(lat: float, lon: float, days: int = 7) -> list:
    """Return a list of daily forecasts for the next `days` days (Europe/Paris)."""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        "timezone": "Europe/Paris",
        "forecast_days": max(1, min(days, 16)),
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            resp = await c.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning(f"Open-Meteo fetch failed: {e}")
        return []
    daily = data.get("daily") or {}
    times = daily.get("time") or []
    codes = daily.get("weather_code") or []
    tmax = daily.get("temperature_2m_max") or []
    tmin = daily.get("temperature_2m_min") or []
    precip = daily.get("precipitation_probability_max") or []
    out = []
    for i, d in enumerate(times):
        code = codes[i] if i < len(codes) else 0
        label, icon = WMO_CODES.get(code, ("—", "partly-sunny"))
        out.append({
            "date": d,  # YYYY-MM-DD
            "code": code,
            "label": label,
            "icon": icon,
            "temp_max": round(tmax[i]) if i < len(tmax) and tmax[i] is not None else None,
            "temp_min": round(tmin[i]) if i < len(tmin) and tmin[i] is not None else None,
            "precipitation": precip[i] if i < len(precip) and precip[i] is not None else None,
        })
    return out

# ============ PUSH NOTIFICATIONS (Emergent managed) ============
async def send_push(recipients: List[str], data: dict, idempotency_key: Optional[str] = None) -> None:
    if not recipients:
        return
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    payload: dict = {"recipients": recipients[:100], "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    resp = await push_client.post("/api/v1/push/trigger", json=payload)
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()

@api_router.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    resp = await push_client.post("/api/v1/push/users/register", json=body.model_dump())
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()
    return {"status": "registered"}

# ============ MATCH REMINDERS (scheduled push: 24h + 2h before start) ============
async def _send_reminder(a: dict, field: str, title: str, message: str, idem: str):
    players = a.get("players") or [a["author_id"]]
    muted = a.get("muted_by") or []
    recipients = [p for p in players if p not in muted]
    if recipients:
        try:
            await send_push(
                recipients=recipients,
                data={"title": title, "message": message, "action_url": f"/club/{a['club_id']}"},
                idempotency_key=idem,
            )
        except Exception as e:
            logger.warning(f"Reminder push failed (non-blocking): {e}")
    # Mark as attempted so we don't retry every tick (idempotency_key dedupes on the relay)
    await db.announcements.update_one({"id": a["id"]}, {"$set": {field: True}})

async def reminder_tick():
    now = datetime.now(timezone.utc)
    async for a in db.announcements.find({"match_date": {"$ne": None}}):
        if a.get("reminded_24h") and a.get("reminded_2h"):
            continue
        raw = a.get("match_date")
        if not raw:
            continue
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        delta = dt - now
        when = dt.astimezone(PARIS_TZ).strftime("%d/%m à %Hh%M")
        club = await db.clubs.find_one({"id": a["club_id"]})
        club_name = club["name"] if club else "ton club"
        if timedelta(hours=2) < delta <= timedelta(hours=24) and not a.get("reminded_24h"):
            await _send_reminder(
                a, "reminded_24h", "Rappel de match 🎾",
                f"Ton match à {club_name} approche : {when}.", f"remind24-{a['id']}",
            )
        elif timedelta(0) < delta <= timedelta(hours=2) and not a.get("reminded_2h"):
            await _send_reminder(
                a, "reminded_2h", "Ton match commence bientôt ⏰",
                f"Rendez-vous à {club_name} vers {when}. Prêt(e) ?", f"remind2-{a['id']}",
            )

async def reminder_loop():
    while True:
        try:
            await reminder_tick()
        except Exception as e:
            logger.warning(f"reminder_loop error: {e}")
        await asyncio.sleep(300)

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
        "first_name": body.first_name.strip(),
        "last_name": body.last_name.strip(),
        "phone": body.phone.strip(),
        "birth_date": body.birth_date.strip(),
        "city": body.city.strip(),
        "avatar_url": None,
        "level": "Débutant",
        "bio": None,
        "reliability_sum": 0,
        "reliability_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    token = make_token(user_id)
    return {"token": token, "user": user_me(user)}

@api_router.post("/auth/login")
async def login(body: LoginInput):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not check_pw(body.password, user["password_hash"]):
        raise HTTPException(401, "Email ou mot de passe incorrect")
    token = make_token(user["id"])
    return {"token": token, "user": user_me(user)}

@api_router.get("/auth/me")
async def me(user=Depends(current_user)):
    return user_me(user)

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
    for f in ("first_name", "last_name", "phone", "birth_date", "city"):
        val = getattr(body, f)
        if val is not None:
            updates[f] = val.strip()
    if body.preferred_region is not None:
        updates["preferred_region"] = body.preferred_region.strip() or None
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    updated = await db.users.find_one({"id": user["id"]})
    return user_me(updated)

@api_router.delete("/auth/me")
async def delete_me(user=Depends(current_user)):
    uid = user["id"]
    # Reverse the reliability this user gave to others, then drop their ratings
    async for r in db.ratings.find({"from_user": uid}):
        await db.users.update_one(
            {"id": r["to_user"]},
            {"$inc": {"reliability_sum": -r.get("stars", 0), "reliability_count": -1}},
        )
    await db.ratings.delete_many({"$or": [{"from_user": uid}, {"to_user": uid}]})
    # Delete their conversations/messages
    await db.messages.delete_many({"$or": [{"from_user_id": uid}, {"to_user_id": uid}]})
    # Delete matches they created, and remove them from any other match
    await db.announcements.delete_many({"author_id": uid})
    await db.announcements.update_many({}, {"$pull": {"players": uid, "muted_by": uid, "rated_by": uid}})
    # Remove them from other users' favorites
    await db.users.update_many({"favorites": uid}, {"$pull": {"favorites": uid}})
    # Finally, delete the account
    await db.users.delete_one({"id": uid})
    return {"status": "deleted"}

# ============ USERS ============
@api_router.get("/users/favorites")
async def list_favorites(user=Depends(current_user)):
    fav_ids = user.get("favorites") or []
    out = []
    for fid in fav_ids:
        u = await db.users.find_one({"id": fid})
        if u:
            out.append(user_public(u, user))
    return out

@api_router.get("/users/{user_id}")
async def get_user(user_id: str, user=Depends(current_user)):
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(404, "Utilisateur introuvable")
    return user_public(u, user)

@api_router.post("/users/{user_id}/favorite")
async def toggle_favorite(user_id: str, user=Depends(current_user)):
    if user_id == user["id"]:
        raise HTTPException(400, "Impossible de s'ajouter en favori")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "Utilisateur introuvable")
    favorites = user.get("favorites") or []
    if user_id in favorites:
        favorites = [f for f in favorites if f != user_id]
        is_fav = False
    else:
        favorites.append(user_id)
        is_fav = True
    await db.users.update_one({"id": user["id"]}, {"$set": {"favorites": favorites}})
    return {"is_favorite": is_fav}

async def apply_rating(from_id: str, to_id: str, stars: int):
    existing = await db.ratings.find_one({"from_user": from_id, "to_user": to_id})
    if existing:
        delta = stars - existing["stars"]
        await db.ratings.update_one({"_id": existing["_id"]}, {"$set": {"stars": stars}})
        await db.users.update_one({"id": to_id}, {"$inc": {"reliability_sum": delta}})
    else:
        await db.ratings.insert_one({
            "id": str(uuid.uuid4()),
            "from_user": from_id,
            "to_user": to_id,
            "stars": stars,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.users.update_one({"id": to_id}, {"$inc": {"reliability_sum": stars, "reliability_count": 1}})

@api_router.post("/users/{user_id}/rate")
async def rate_user(user_id: str, body: RatingInput, user=Depends(current_user)):
    if user_id == user["id"]:
        raise HTTPException(400, "Impossible de se noter soi-même")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "Utilisateur introuvable")
    await apply_rating(user["id"], user_id, body.stars)
    updated = await db.users.find_one({"id": user_id})
    return user_public(updated, user)

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

@api_router.get("/clubs/nearest")
async def nearest_clubs(q: str, limit: int = 6, user=Depends(current_user)):
    """Given a city/place name, return the nearest approved clubs by distance."""
    coords = await geocode_city(q)
    if not coords or coords.get("lat") is None:
        return {"city": None, "clubs": []}
    lat, lon = coords["lat"], coords["lon"]
    clubs = await db.clubs.find({"approved": True}, {"_id": 0}).to_list(500)
    scored = []
    for c in clubs:
        if c.get("latitude") is None or c.get("longitude") is None:
            continue
        c["distance_km"] = round(haversine_km(lat, lon, c["latitude"], c["longitude"]))
        c["announcements_count"] = await db.announcements.count_documents({"club_id": c["id"]})
        scored.append(c)
    scored.sort(key=lambda x: x["distance_km"])
    return {"city": coords.get("name"), "clubs": scored[:max(1, min(limit, 20))]}

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
        "price_per_hour": body.price_per_hour,
        "approved": False,  # awaiting moderation, but list to author
        "suggested_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.clubs.insert_one(club)
    club.pop("_id", None)
    club["announcements_count"] = 0
    return club

class ClubAdminUpdate(BaseModel):
    price_per_hour: Optional[float] = Field(default=None, ge=0, le=200)
    is_outdoor: Optional[bool] = None

@api_router.patch("/clubs/{club_id}")
async def admin_update_club(club_id: str, body: ClubAdminUpdate, user=Depends(current_user)):
    if not is_admin_user(user):
        raise HTTPException(403, "Réservé aux administrateurs")
    club = await db.clubs.find_one({"id": club_id})
    if not club:
        raise HTTPException(404, "Club introuvable")
    # exclude_unset so untouched fields are preserved (price can still be explicitly set to null)
    updates = body.model_dump(exclude_unset=True)
    if updates:
        await db.clubs.update_one({"id": club_id}, {"$set": updates})
    updated = await db.clubs.find_one({"id": club_id}, {"_id": 0})
    return updated

# ============ ANNOUNCEMENTS (Match requests per Club, 4 players) ============
MAX_PLAYERS = 4

async def serialize_announcement(a: dict, viewer: dict, club: Optional[dict] = None) -> dict:
    current_user_id = viewer["id"]
    author = await db.users.find_one({"id": a["author_id"]})
    player_ids = a.get("players") or [a["author_id"]]
    offline_names = a.get("offline_names")
    if offline_names is None:
        offline_names = ["" for _ in range(a.get("offline_count", 0))]
    offline_count = len(offline_names)
    players = []
    for pid in player_ids:
        pu = await db.users.find_one({"id": pid})
        if pu:
            players.append(user_public(pu, viewer))
    total = len(players) + offline_count
    if club is None:
        club = await db.clubs.find_one({"id": a["club_id"]})
    status = match_status(a.get("match_date"), a.get("match_end_date"))
    rated_by = a.get("rated_by") or []
    is_full = total >= MAX_PLAYERS
    is_real_member = current_user_id in player_ids
    other_real = len([p for p in player_ids if p != current_user_id])
    can_rate = is_full and status == "past" and is_real_member and other_real > 0 and current_user_id not in rated_by
    return {
        "id": a["id"],
        "club_id": a["club_id"],
        "club_name": club["name"] if club else None,
        "author": user_public(author, viewer) if author else None,
        "content": a["content"],
        "availability": a.get("availability"),
        "match_date": a.get("match_date"),
        "match_end_date": a.get("match_end_date"),
        "court_price": a.get("court_price"),
        "status": status,
        "created_at": a["created_at"],
        "players": players,
        "offline_players": offline_names,
        "offline_count": offline_count,
        "total_players": total,
        "max_players": MAX_PLAYERS,
        "slots_left": max(0, MAX_PLAYERS - total),
        "is_full": is_full,
        "is_member": current_user_id in player_ids,
        "is_author": current_user_id == a["author_id"],
        "can_rate": can_rate,
        "has_rated": current_user_id in rated_by,
        "reminders_muted": current_user_id in (a.get("muted_by") or []),
    }

@api_router.get("/clubs/{club_id}/announcements")
async def list_announcements(club_id: str, user=Depends(current_user)):
    club = await db.clubs.find_one({"id": club_id})
    if not club:
        raise HTTPException(404, "Club introuvable")
    items = await db.announcements.find({"club_id": club_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    out = []
    for a in items:
        s = await serialize_announcement(a, user, club)
        if s["author"]:
            out.append(s)
    return out

@api_router.get("/matches/history")
async def matches_history(user=Depends(current_user)):
    items = await db.announcements.find(
        {"$or": [{"players": user["id"]}, {"author_id": user["id"]}]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    out = []
    for a in items:
        s = await serialize_announcement(a, user)
        if s["author"]:
            out.append(s)
    return out

@api_router.get("/clubs/{club_id}/weather")
async def club_weather(club_id: str, _=Depends(current_user)):
    club = await db.clubs.find_one({"id": club_id})
    if not club:
        raise HTTPException(404, "Club introuvable")
    if not club.get("is_outdoor"):
        return {"outdoor": False, "days": []}
    lat, lon = club.get("latitude"), club.get("longitude")
    if lat is None or lon is None:
        return {"outdoor": True, "days": []}
    days = await fetch_forecast(lat, lon, days=7)
    return {"outdoor": True, "days": days}

@api_router.get("/matches/open")
async def open_matches(
    level: Optional[str] = None,
    date: Optional[str] = None,
    region: Optional[str] = None,
    search: Optional[str] = None,
    sort: Optional[str] = None,
    user=Depends(current_user),
):
    """Open matches (not full) across all clubs — upcoming or undated — with optional filters."""
    # Target calendar day (Europe/Paris) if a date filter is provided
    target_day = None
    if date:
        try:
            target_day = datetime.fromisoformat(date.replace("Z", "+00:00")).astimezone(PARIS_TZ).date()
        except Exception:
            target_day = None

    items = await db.announcements.find({}, {"_id": 0}).sort("match_date", 1).to_list(500)
    clubs_cache: dict = {}
    out = []
    for a in items:
        status = match_status(a.get("match_date"), a.get("match_end_date"))
        if status not in ("upcoming", "undated"):
            continue
        club = clubs_cache.get(a["club_id"])
        if club is None:
            club = await db.clubs.find_one({"id": a["club_id"]})
            clubs_cache[a["club_id"]] = club
        if not club or not club.get("approved"):
            continue
        if region and club.get("region") != region:
            continue
        if search:
            s = search.lower()
            if s not in (club.get("name", "").lower()) and s not in (club.get("city", "").lower()):
                continue
        author = await db.users.find_one({"id": a["author_id"]})
        if not author:
            continue
        if level and level != "Tous" and author.get("level") != level:
            continue
        if target_day is not None:
            raw = a.get("match_date")
            if not raw:
                continue
            try:
                d = datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(PARIS_TZ).date()
            except Exception:
                continue
            if d != target_day:
                continue
        s = await serialize_announcement(a, user, club)
        if s["is_full"] or not s["author"]:
            continue
        s["club_city"] = club.get("city")
        s["club_region"] = club.get("region")
        s["club_is_outdoor"] = bool(club.get("is_outdoor"))
        s["_lat"] = club.get("latitude")
        s["_lon"] = club.get("longitude")
        out.append(s)

    # Sort by distance from the viewer's city when requested, else by date
    if sort == "distance" and user.get("city"):
        coords = await geocode_city(user["city"])
        if coords and coords.get("lat") is not None:
            for s in out:
                if s["_lat"] is not None and s["_lon"] is not None:
                    s["distance_km"] = round(haversine_km(coords["lat"], coords["lon"], s["_lat"], s["_lon"]))
                else:
                    s["distance_km"] = None
            out.sort(key=lambda x: (x.get("distance_km") is None, x.get("distance_km") or 0))
        else:
            out.sort(key=lambda x: (x.get("match_date") is None, x.get("match_date") or ""))
    else:
        out.sort(key=lambda x: (x.get("match_date") is None, x.get("match_date") or ""))

    for s in out:
        s.pop("_lat", None)
        s.pop("_lon", None)
    return out

@api_router.post("/clubs/{club_id}/announcements")
async def create_announcement(club_id: str, body: AnnouncementCreate, user=Depends(current_user)):
    club = await db.clubs.find_one({"id": club_id})
    if not club:
        raise HTTPException(404, "Club introuvable")
    offline_names = [n.strip() for n in (body.offline_names or []) if n.strip()][:3]
    if not offline_names and body.party_size > 1:
        offline_names = ["" for _ in range(body.party_size - 1)]
    if 1 + len(offline_names) > MAX_PLAYERS:
        offline_names = offline_names[:MAX_PLAYERS - 1]
    ann_id = str(uuid.uuid4())
    ann = {
        "id": ann_id,
        "club_id": club_id,
        "author_id": user["id"],
        "content": body.content,
        "availability": body.availability,
        "match_date": body.match_date,
        "match_end_date": body.match_end_date,
        "court_price": body.court_price,
        "players": [user["id"]],
        "offline_names": offline_names,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.announcements.insert_one(ann)
    # Alert players whose preferred region == club region and whose level == organizer level
    try:
        author_level = user.get("level")
        recipients = []
        async for u in db.users.find({
            "preferred_region": club["region"],
            "level": author_level,
            "id": {"$ne": user["id"]},
        }):
            recipients.append(u["id"])
        if recipients:
            await send_push(
                recipients=recipients,
                data={
                    "title": "Nouveau match près de chez toi ! 🎾",
                    "message": f"Un match niveau {author_level} vient d'ouvrir à {club['name']} ({club['region']}).",
                    "action_url": f"/club/{club_id}",
                },
                idempotency_key=f"newmatch-{ann_id}",
            )
    except Exception as e:
        logger.warning(f"New-match alert push failed (non-blocking): {e}")
    return await serialize_announcement(ann, user, club)

@api_router.post("/announcements/{ann_id}/replay")
async def replay_match(ann_id: str, body: ReplayInput, user=Depends(current_user)):
    src = await db.announcements.find_one({"id": ann_id})
    if not src:
        raise HTTPException(404, "Match introuvable")
    club = await db.clubs.find_one({"id": src["club_id"]})
    players = src.get("players") or [src["author_id"]]
    offline_names = src.get("offline_names")
    if offline_names is None:
        offline_names = ["" for _ in range(src.get("offline_count", 0))]
    new_id = str(uuid.uuid4())
    ann = {
        "id": new_id,
        "club_id": src["club_id"],
        "author_id": user["id"],
        "content": "🎾 On rejoue ensemble ? Même équipe pour un nouveau match !",
        "availability": None,
        "match_date": body.match_date,
        "match_end_date": body.match_end_date,
        "court_price": body.court_price,
        "players": players,  # same registered players
        "offline_names": offline_names,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.announcements.insert_one(ann)
    # Invite each registered co-player via a private message
    when = ""
    if body.match_date:
        try:
            dt = datetime.fromisoformat(body.match_date.replace("Z", "+00:00"))
            when = f" le {dt.strftime('%d/%m à %Hh%M')}"
        except Exception:
            when = ""
    club_name = club["name"] if club else "notre club"
    for pid in players:
        if pid == user["id"]:
            continue
        await db.messages.insert_one({
            "id": str(uuid.uuid4()),
            "conv_id": conv_id(user["id"], pid),
            "from_user_id": user["id"],
            "to_user_id": pid,
            "content": f"🎾 {user['pseudo']} propose de rejouer{when} à {club_name} !",
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    return await serialize_announcement(ann, user, club)

@api_router.post("/announcements/{ann_id}/join")
async def join_announcement(ann_id: str, user=Depends(current_user)):
    ann = await db.announcements.find_one({"id": ann_id})
    if not ann:
        raise HTTPException(404, "Annonce introuvable")
    players = ann.get("players") or [ann["author_id"]]
    offline_names = ann.get("offline_names")
    offline_count = len(offline_names) if offline_names is not None else ann.get("offline_count", 0)
    if user["id"] in players:
        return await serialize_announcement(ann, user)
    if len(players) + offline_count >= MAX_PLAYERS:
        raise HTTPException(409, "Match complet (4 joueurs)")
    players.append(user["id"])
    await db.announcements.update_one({"id": ann_id}, {"$set": {"players": players}})
    ann["players"] = players
    # Notify the organizer when the match becomes full (4/4)
    now_total = len(players) + offline_count
    if now_total >= MAX_PLAYERS and ann["author_id"] != user["id"]:
        club = await db.clubs.find_one({"id": ann["club_id"]})
        club_name = club["name"] if club else "ton club"
        try:
            await send_push(
                recipients=[ann["author_id"]],
                data={
                    "title": "Match complet ! 🎾",
                    "message": f"{user['pseudo']} a rejoint : ton match à {club_name} est au complet (4/4).",
                    "action_url": f"/club/{ann['club_id']}",
                },
                idempotency_key=f"match-full-{ann_id}",
            )
        except Exception as e:
            logger.warning(f"Push failed (non-blocking): {e}")
    return await serialize_announcement(ann, user)

@api_router.post("/announcements/{ann_id}/leave")
async def leave_announcement(ann_id: str, user=Depends(current_user)):
    ann = await db.announcements.find_one({"id": ann_id})
    if not ann:
        raise HTTPException(404, "Annonce introuvable")
    if user["id"] == ann["author_id"]:
        raise HTTPException(400, "L'organisateur ne peut pas quitter son match")
    players = [p for p in (ann.get("players") or [ann["author_id"]]) if p != user["id"]]
    await db.announcements.update_one({"id": ann_id}, {"$set": {"players": players}})
    ann["players"] = players
    return await serialize_announcement(ann, user)

@api_router.post("/announcements/{ann_id}/rate")
async def rate_match(ann_id: str, body: MatchRatingInput, user=Depends(current_user)):
    ann = await db.announcements.find_one({"id": ann_id})
    if not ann:
        raise HTTPException(404, "Match introuvable")
    players = ann.get("players") or [ann["author_id"]]
    if user["id"] not in players:
        raise HTTPException(403, "Tu n'as pas participé à ce match")
    for r in body.ratings:
        if r.user_id == user["id"] or r.user_id not in players:
            continue
        if not await db.users.find_one({"id": r.user_id}):
            continue
        await apply_rating(user["id"], r.user_id, r.stars)
    rated_by = ann.get("rated_by") or []
    if user["id"] not in rated_by:
        rated_by.append(user["id"])
    await db.announcements.update_one({"id": ann_id}, {"$set": {"rated_by": rated_by}})
    ann["rated_by"] = rated_by
    return await serialize_announcement(ann, user)

@api_router.post("/announcements/{ann_id}/mute")
async def toggle_match_reminders(ann_id: str, user=Depends(current_user)):
    ann = await db.announcements.find_one({"id": ann_id})
    if not ann:
        raise HTTPException(404, "Match introuvable")
    muted = ann.get("muted_by") or []
    if user["id"] in muted:
        muted = [m for m in muted if m != user["id"]]
    else:
        muted.append(user["id"])
    await db.announcements.update_one({"id": ann_id}, {"$set": {"muted_by": muted}})
    ann["muted_by"] = muted
    return await serialize_announcement(ann, user)

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

@api_router.get("/messages/unread_count")
async def unread_count(user=Depends(current_user)):
    count = await db.messages.count_documents({"to_user_id": user["id"], "read": False})
    return {"count": count}

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
# Real, well-known French padel clubs (addresses & prices to be confirmed via admin).
IMG_A = "https://images.unsplash.com/photo-1658723826297-fe4d1b1e6600?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"
IMG_B = "https://images.pexels.com/photos/31012869/pexels-photo-31012869.jpeg?auto=compress&cs=tinysrgb&w=800"
_OLD_SEED_CLUBS = [
    {"name": "Casa Padel", "city": "Saint-Denis", "region": "Île-de-France", "address": "Adresse à confirmer", "latitude": 48.9362, "longitude": 2.3574, "image_url": IMG_A},
    {"name": "4PADEL Aubervilliers", "city": "Aubervilliers", "region": "Île-de-France", "address": "Adresse à confirmer", "latitude": 48.9146, "longitude": 2.3844, "image_url": IMG_B},
    {"name": "Padel Attitude", "city": "Chambourcy", "region": "Île-de-France", "address": "Adresse à confirmer", "latitude": 48.9070, "longitude": 2.0430, "image_url": IMG_A},
    {"name": "4PADEL Toulouse", "city": "Toulouse", "region": "Occitanie", "address": "Adresse à confirmer", "latitude": 43.6047, "longitude": 1.4442, "image_url": IMG_B},
    {"name": "Winners Padel", "city": "Toulouse", "region": "Occitanie", "address": "Adresse à confirmer", "latitude": 43.6047, "longitude": 1.4442, "image_url": IMG_A},
    {"name": "4PADEL Perpignan", "city": "Perpignan", "region": "Occitanie", "address": "Adresse à confirmer", "latitude": 42.6887, "longitude": 2.8948, "image_url": IMG_B},
    {"name": "4PADEL Bordeaux", "city": "Mérignac", "region": "Nouvelle-Aquitaine", "address": "Adresse à confirmer", "latitude": 44.8386, "longitude": -0.6436, "image_url": IMG_A},
    {"name": "Urban Padel Bordeaux", "city": "Bordeaux", "region": "Nouvelle-Aquitaine", "address": "Adresse à confirmer", "latitude": 44.8378, "longitude": -0.5792, "image_url": IMG_B},
    {"name": "4PADEL Nantes", "city": "Saint-Herblain", "region": "Pays de la Loire", "address": "Adresse à confirmer", "latitude": 47.2119, "longitude": -1.6493, "image_url": IMG_A},
    {"name": "4PADEL Strasbourg", "city": "Strasbourg", "region": "Grand Est", "address": "Adresse à confirmer", "latitude": 48.5734, "longitude": 7.7521, "image_url": IMG_B},
    {"name": "4PADEL Nancy", "city": "Nancy", "region": "Grand Est", "address": "Adresse à confirmer", "latitude": 48.6921, "longitude": 6.1844, "image_url": IMG_A},
    {"name": "4PADEL Lyon", "city": "Lyon", "region": "Auvergne-Rhône-Alpes", "address": "Adresse à confirmer", "latitude": 45.7640, "longitude": 4.8357, "image_url": IMG_B},
    {"name": "All In Padel Lyon", "city": "Lyon", "region": "Auvergne-Rhône-Alpes", "address": "Adresse à confirmer", "latitude": 45.7640, "longitude": 4.8357, "image_url": IMG_A},
    {"name": "4PADEL Marseille", "city": "Marseille", "region": "Provence-Alpes-Côte d'Azur", "address": "Adresse à confirmer", "latitude": 43.2965, "longitude": 5.3698, "image_url": IMG_B},
    {"name": "Padel Riviera", "city": "Mougins", "region": "Provence-Alpes-Côte d'Azur", "address": "Adresse à confirmer", "latitude": 43.6003, "longitude": 6.9956, "image_url": IMG_A},
    {"name": "Urban Padel Lille", "city": "Lille", "region": "Hauts-de-France", "address": "Adresse à confirmer", "latitude": 50.6292, "longitude": 3.0573, "image_url": IMG_B},
    # --- Extension couverture nationale (adresses/prix à confirmer par l'admin) ---
    {"name": "Esprit Padel Lisses", "city": "Lisses", "region": "Île-de-France", "address": "Adresse à confirmer", "latitude": 48.6017, "longitude": 2.4213, "image_url": IMG_A},
    {"name": "Padel XV Paris", "city": "Paris", "region": "Île-de-France", "address": "Adresse à confirmer", "latitude": 48.8417, "longitude": 2.2897, "image_url": IMG_B},
    {"name": "4PADEL Cergy", "city": "Cergy", "region": "Île-de-France", "address": "Adresse à confirmer", "latitude": 49.0369, "longitude": 2.0610, "image_url": IMG_A},
    {"name": "We Are Padel Massy", "city": "Massy", "region": "Île-de-France", "address": "Adresse à confirmer", "latitude": 48.7261, "longitude": 2.2833, "image_url": IMG_B},
    {"name": "4PADEL Villeneuve-d'Ascq", "city": "Villeneuve-d'Ascq", "region": "Hauts-de-France", "address": "Adresse à confirmer", "latitude": 50.6200, "longitude": 3.1500, "image_url": IMG_A},
    {"name": "We Are Padel Amiens", "city": "Amiens", "region": "Hauts-de-France", "address": "Adresse à confirmer", "latitude": 49.8941, "longitude": 2.2958, "image_url": IMG_B},
    {"name": "Padel Club Rouen", "city": "Rouen", "region": "Normandie", "address": "Adresse à confirmer", "latitude": 49.4432, "longitude": 1.0999, "image_url": IMG_A},
    {"name": "Caen Padel Club", "city": "Caen", "region": "Normandie", "address": "Adresse à confirmer", "latitude": 49.1829, "longitude": -0.3707, "image_url": IMG_B},
    {"name": "4PADEL Rennes", "city": "Rennes", "region": "Bretagne", "address": "Adresse à confirmer", "latitude": 48.1173, "longitude": -1.6778, "image_url": IMG_A},
    {"name": "Brest Padel Club", "city": "Brest", "region": "Bretagne", "address": "Adresse à confirmer", "latitude": 48.3904, "longitude": -4.4861, "image_url": IMG_B},
    {"name": "4PADEL Metz", "city": "Metz", "region": "Grand Est", "address": "Adresse à confirmer", "latitude": 49.1193, "longitude": 6.1757, "image_url": IMG_A},
    {"name": "Reims Padel Club", "city": "Reims", "region": "Grand Est", "address": "Adresse à confirmer", "latitude": 49.2583, "longitude": 4.0317, "image_url": IMG_B},
    {"name": "4PADEL Grenoble", "city": "Grenoble", "region": "Auvergne-Rhône-Alpes", "address": "Adresse à confirmer", "latitude": 45.1885, "longitude": 5.7245, "image_url": IMG_A},
    {"name": "Clermont Padel Club", "city": "Clermont-Ferrand", "region": "Auvergne-Rhône-Alpes", "address": "Adresse à confirmer", "latitude": 45.7772, "longitude": 3.0870, "image_url": IMG_B},
    {"name": "4PADEL Saint-Étienne", "city": "Saint-Étienne", "region": "Auvergne-Rhône-Alpes", "address": "Adresse à confirmer", "latitude": 45.4397, "longitude": 4.3872, "image_url": IMG_A},
    {"name": "4PADEL Annecy", "city": "Annecy", "region": "Auvergne-Rhône-Alpes", "address": "Adresse à confirmer", "latitude": 45.8992, "longitude": 6.1294, "image_url": IMG_B},
    {"name": "4PADEL Anglet", "city": "Anglet", "region": "Nouvelle-Aquitaine", "address": "Adresse à confirmer", "latitude": 43.4832, "longitude": -1.5140, "image_url": IMG_A},
    {"name": "Poitiers Padel Club", "city": "Poitiers", "region": "Nouvelle-Aquitaine", "address": "Adresse à confirmer", "latitude": 46.5802, "longitude": 0.3404, "image_url": IMG_B},
    {"name": "Limoges Padel Club", "city": "Limoges", "region": "Nouvelle-Aquitaine", "address": "Adresse à confirmer", "latitude": 45.8336, "longitude": 1.2611, "image_url": IMG_A},
    {"name": "4PADEL Montpellier", "city": "Montpellier", "region": "Occitanie", "address": "Adresse à confirmer", "latitude": 43.6108, "longitude": 3.8767, "image_url": IMG_B},
    {"name": "Set Padel Nîmes", "city": "Nîmes", "region": "Occitanie", "address": "Adresse à confirmer", "latitude": 43.8367, "longitude": 4.3601, "image_url": IMG_A},
    {"name": "4PADEL Nice", "city": "Nice", "region": "Provence-Alpes-Côte d'Azur", "address": "Adresse à confirmer", "latitude": 43.7102, "longitude": 7.2620, "image_url": IMG_B},
    {"name": "4PADEL Aix-en-Provence", "city": "Aix-en-Provence", "region": "Provence-Alpes-Côte d'Azur", "address": "Adresse à confirmer", "latitude": 43.5297, "longitude": 5.4474, "image_url": IMG_A},
    {"name": "Toulon Padel Club", "city": "Toulon", "region": "Provence-Alpes-Côte d'Azur", "address": "Adresse à confirmer", "latitude": 43.1242, "longitude": 5.9280, "image_url": IMG_B},
    {"name": "Cannes Padel Club", "city": "Cannes", "region": "Provence-Alpes-Côte d'Azur", "address": "Adresse à confirmer", "latitude": 43.5528, "longitude": 7.0174, "image_url": IMG_A},
    {"name": "Dijon Padel Club", "city": "Dijon", "region": "Bourgogne-Franche-Comté", "address": "Adresse à confirmer", "latitude": 47.3220, "longitude": 5.0415, "image_url": IMG_B},
    {"name": "Besançon Padel Club", "city": "Besançon", "region": "Bourgogne-Franche-Comté", "address": "Adresse à confirmer", "latitude": 47.2378, "longitude": 6.0241, "image_url": IMG_A},
    {"name": "4PADEL Orléans", "city": "Orléans", "region": "Centre-Val de Loire", "address": "Adresse à confirmer", "latitude": 47.9029, "longitude": 1.9093, "image_url": IMG_B},
    {"name": "Tours Padel Club", "city": "Tours", "region": "Centre-Val de Loire", "address": "Adresse à confirmer", "latitude": 47.3941, "longitude": 0.6848, "image_url": IMG_A},
    {"name": "Le Mans Padel Club", "city": "Le Mans", "region": "Pays de la Loire", "address": "Adresse à confirmer", "latitude": 48.0061, "longitude": 0.1996, "image_url": IMG_B},
    {"name": "Angers Padel Club", "city": "Angers", "region": "Pays de la Loire", "address": "Adresse à confirmer", "latitude": 47.4784, "longitude": -0.5632, "image_url": IMG_A},
    {"name": "Ajaccio Padel Club", "city": "Ajaccio", "region": "Corse", "address": "Adresse à confirmer", "latitude": 41.9192, "longitude": 8.7386, "image_url": IMG_B},
]

# Real French clubs (387) imported from clubs_fr.json — source of truth for seeding
import json as _json
with open(ROOT_DIR / "clubs_fr.json", encoding="utf-8") as _f:
    REAL_CLUBS = _json.load(_f)

@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("pseudo_lower")
    await db.clubs.create_index("id", unique=True)
    await db.messages.create_index("conv_id")
    await db.messages.create_index([("from_user_id", 1), ("to_user_id", 1)])

    # One-time migration: replace legacy placeholder clubs (no source_id) with the real import.
    # A legacy club is kept only if it has a REAL match (a match_date set or players joined);
    # otherwise the club and its demo announcements are removed.
    if not await db.meta.find_one({"_id": "clubs_import_v2"}):
        legacy = await db.clubs.find({"source_id": {"$exists": False}}, {"id": 1}).to_list(2000)
        removed = 0
        for lc in legacy:
            real = await db.announcements.count_documents({
                "club_id": lc["id"],
                "$or": [
                    {"match_date": {"$nin": [None, ""]}},
                    {"players.0": {"$exists": True}},
                ],
            })
            if real == 0:
                await db.announcements.delete_many({"club_id": lc["id"]})
                await db.clubs.delete_one({"id": lc["id"]})
                removed += 1
        await db.meta.insert_one({
            "_id": "clubs_import_v2",
            "removed": removed,
            "at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Clubs import v2: removed {removed} legacy placeholder clubs")

    # Seed real French clubs (idempotent by source_id); price stays None → "Tarif à confirmer"
    seeded = 0
    for c in REAL_CLUBS:
        if not await db.clubs.find_one({"source_id": c["source_id"]}):
            await db.clubs.insert_one({
                "id": str(uuid.uuid4()),
                "approved": True,
                "price_per_hour": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
                **c,
            })
            seeded += 1
    logger.info(f"Ensured real clubs seeded ({len(REAL_CLUBS)} total, {seeded} new)")

    # Ensure every club has an is_outdoor flag (default: indoor)
    await db.clubs.update_many({"is_outdoor": {"$exists": False}}, {"$set": {"is_outdoor": False}})

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

    # start the match reminder scheduler (24h + 2h before start)
    asyncio.create_task(reminder_loop())

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
