"""AI content moderation (Jev decision model via Emergent universal key) + warnings/suspension."""
import os
import logging
from datetime import datetime, timezone
from functools import lru_cache

from dotenv import load_dotenv
from fastapi import HTTPException
from typesafe_sdk import AsyncTypeSafeClient, RetryPolicy, Choice, Noul, TypeSafeError

load_dotenv()
logger = logging.getLogger("padelconnect.moderation")

MAX_WARNINGS = 3

CATEGORIES = {
    "ok": "Contenu acceptable : discussion normale, organisation de match, humour bon enfant, désaccord poli, mots familiers sans attaque",
    "hate": "Haine ou discrimination : racisme, antisémitisme, islamophobie, homophobie, sexisme, insultes visant une origine, religion, handicap ou orientation",
    "violence": "Violence ou menaces : menaces physiques, appel à la violence, intimidation, souhaits de mal",
    "harassment": "Harcèlement ou insultes graves : insultes directes répétées, humiliation, dénigrement ciblé d'une personne",
    "sexual": "Contenu sexuel explicite ou avances sexuelles non sollicitées",
}

CATEGORY_LABELS = {
    "hate": "propos haineux ou discriminatoires",
    "violence": "violence ou menaces",
    "harassment": "harcèlement ou insultes",
    "sexual": "contenu sexuel",
}

KIND_LABELS = {
    "message": "Message non envoyé",
    "announcement": "Annonce non publiée",
    "pseudo": "Pseudo refusé",
    "bio": "Bio refusée",
}


@lru_cache(maxsize=1)
def get_jev_client() -> AsyncTypeSafeClient:
    proxy = (
        os.getenv("INTEGRATION_PROXY_URL")
        or os.getenv("integration_proxy_url")
        or "https://integrations.emergentagent.com"
    ).rstrip("/")
    return AsyncTypeSafeClient(
        api_key=os.environ["EMERGENT_LLM_KEY"],
        base_url=f"{proxy}/llm/typesafe",
        retry=RetryPolicy(max_retries=2, respect_retry_after=False),
    )


async def classify_text(text: str, kind: str) -> dict:
    """Returns {"allowed": bool, "category": str|None, "confidence": float, "checked": bool}.
    Fails open (allowed, checked=False) if the decision service is unavailable."""
    try:
        response = await get_jev_client().system_one(
            model="jev-latest",
            state={
                "kind": kind,
                "context": "Texte écrit par un joueur dans une application française de padel amateur (messagerie privée, annonces de match, profil).",
                "text": text,
            },
            questions={
                "category": Choice(
                    instructions="Dans quelle catégorie ce texte tombe-t-il ? Choisis 'ok' sauf si le texte est clairement abusif. Tiens compte de l'argot, des fautes volontaires et des mots déguisés.",
                    criteria=CATEGORIES,
                ),
                "abusive": Noul(
                    instructions="Ce texte contient-il de la haine, du racisme, de la violence, du harcèlement ou du contenu sexuel non sollicité et doit-il être bloqué ?"
                ),
            },
        )
    except TypeSafeError as exc:
        logger.warning(f"Moderation unavailable, allowing text (kind={kind}): {exc}")
        return {"allowed": True, "category": None, "confidence": 0.0, "checked": False}
    cat = response.choices["category"]
    abusive_p = response.nouls["abusive"].noul
    category = cat.choice
    blocked = (category != "ok" and cat.confidence >= 0.55) or abusive_p >= 0.75
    if blocked and category == "ok":
        # abusive probability high but no category stood out
        probs = {k: v for k, v in cat.probabilities.items() if k != "ok"}
        category = max(probs, key=probs.get) if probs else "harassment"
    return {
        "allowed": not blocked,
        "category": None if not blocked else category,
        "confidence": round(max(cat.confidence, abusive_p), 2),
        "checked": True,
    }


async def enforce_clean_text(db, user: dict, text: str, kind: str) -> dict:
    """Classify `text`; if refused, add a warning to the author (3 → suspension) and raise 422.
    Returns the classification when allowed."""
    if not text or not text.strip():
        return {"allowed": True, "category": None, "confidence": 0.0, "checked": False}
    result = await classify_text(text.strip(), kind)
    if result["allowed"]:
        return result
    label = CATEGORY_LABELS.get(result["category"] or "", "contenu non autorisé")
    head = KIND_LABELS.get(kind, "Contenu refusé")
    if not user.get("id"):
        # Not yet registered (sign-up pseudo): refuse without warning bookkeeping
        raise HTTPException(422, f"{head} : {label}. Choisis-en un autre.")
    warnings = int(user.get("warnings", 0)) + 1
    updates = {"warnings": warnings}
    suspended = warnings >= MAX_WARNINGS
    if suspended:
        updates["suspended"] = True
        updates["suspended_reason"] = f"{MAX_WARNINGS} avertissements pour contenu non autorisé"
    await db.users.update_one({"id": user["id"]}, {"$set": updates})
    await db.moderation_events.insert_one({
        "user_id": user["id"],
        "kind": kind,
        "text": text.strip()[:500],
        "category": result["category"],
        "confidence": result["confidence"],
        "warning_number": warnings,
        "suspended": suspended,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    if suspended:
        detail = f"{head} : {label}. Ton compte est suspendu après {MAX_WARNINGS} avertissements. Contacte le support pour toute question."
        raise HTTPException(403, detail)
    detail = f"{head} : {label}. Avertissement {warnings}/{MAX_WARNINGS} — au 3e, ton compte sera suspendu."
    raise HTTPException(422, detail)
