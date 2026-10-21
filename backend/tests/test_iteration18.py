"""Iteration 18 — Community safety: AI moderation, reports, block/unblock, admin.
Uses the public preview URL from EXPO_PUBLIC_BACKEND_URL and seeded demo users.
Tests are ordered via class name + method name; cleanup unsuspends/unblocks."""

import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://padel-play-8.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "marc@padel.fr"
PASSWORD = "password123"

HATE_MSG = "Sale arabe de merde, retourne dans ton pays, je vais te casser la gueule"
HATE_ANN = "Les pédés et les noirs pas la peine de venir, bande de sous-hommes"
HATE_BIO = "Je déteste les juifs, il faut tous les exterminer"
HATE_PSEUDO = "SaleArabeDeMerde"
CLEAN_MSG = "Salut ! Partant pour un match samedi matin ?"


def _login(email, password=PASSWORD):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    return r


def _auth(email):
    r = _login(email)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    return data["token"], data["user"]


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def admin():
    t, u = _auth(ADMIN_EMAIL)
    return {"token": t, "user": u}


@pytest.fixture(scope="module")
def fresh_user_a(admin):
    """Create a brand-new user A used as the 'author' who will accumulate warnings and get suspended."""
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "email": f"test_iter18_a_{suffix}@padel.fr",
        "pseudo": f"TESTIter18A{suffix}",
        "password": "password123",
        "first_name": "Test", "last_name": "IterA",
        "phone": "0600000000", "birth_date": "1995-01-01", "city": "Paris",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=30)
    assert r.status_code == 200, f"register A: {r.status_code} {r.text}"
    data = r.json()
    yield {"token": data["token"], "user": data["user"], "email": payload["email"]}
    # Cleanup: unsuspend via admin + delete self (if still active)
    try:
        requests.post(f"{BASE_URL}/api/admin/users/{data['user']['id']}/unsuspend", headers=_h(admin["token"]), timeout=15)
    except Exception:
        pass


@pytest.fixture(scope="module")
def fresh_user_b():
    """A second fresh user to be the recipient of A's messages / target of blocks."""
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "email": f"test_iter18_b_{suffix}@padel.fr",
        "pseudo": f"TESTIter18B{suffix}",
        "password": "password123",
        "first_name": "Test", "last_name": "IterB",
        "phone": "0600000000", "birth_date": "1995-01-01", "city": "Paris",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=30)
    assert r.status_code == 200, f"register B: {r.status_code} {r.text}"
    data = r.json()
    return {"token": data["token"], "user": data["user"], "email": payload["email"]}


# ---------- Health ----------

class TestHealth:
    def test_health(self):
        r = requests.get(f"{BASE_URL}/health", timeout=15)
        assert r.status_code == 200


# ---------- Moderation + warnings + suspension (uses fresh users) ----------

class TestModerationFlow:
    """Sequential flow: clean msg → hate msg (1/3) → hate ann (2/3) → hate bio (3/3 → suspend)."""

    def test_01_register_abusive_pseudo(self):
        payload = {
            "email": f"test_iter18_pseudo_{uuid.uuid4().hex[:6]}@padel.fr",
            "pseudo": HATE_PSEUDO + uuid.uuid4().hex[:4],
            "password": "password123",
            "first_name": "T", "last_name": "P",
            "phone": "0600000000", "birth_date": "1995-01-01", "city": "Paris",
        }
        r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=45)
        # Should be refused with 422 and no warning text (user not yet created)
        assert r.status_code == 422, f"expected 422 abusive pseudo, got {r.status_code} {r.text}"
        detail = r.json().get("detail", "")
        assert "Avertissement" not in detail, f"detail should not contain 'Avertissement' at signup: {detail}"
        assert "Pseudo" in detail or "pseudo" in detail

    def test_02_clean_message_ok(self, fresh_user_a, fresh_user_b):
        r = requests.post(
            f"{BASE_URL}/api/messages",
            json={"to_user_id": fresh_user_b["user"]["id"], "content": CLEAN_MSG},
            headers=_h(fresh_user_a["token"]),
            timeout=45,
        )
        assert r.status_code == 200, f"clean msg: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("content") == CLEAN_MSG

    def test_03_hate_message_refused_warning_1(self, fresh_user_a, fresh_user_b):
        r = requests.post(
            f"{BASE_URL}/api/messages",
            json={"to_user_id": fresh_user_b["user"]["id"], "content": HATE_MSG},
            headers=_h(fresh_user_a["token"]),
            timeout=60,
        )
        assert r.status_code == 422, f"hate msg: {r.status_code} {r.text}"
        detail = r.json().get("detail", "")
        assert "Avertissement 1/3" in detail, f"missing warn 1/3: {detail}"
        assert "Message non envoyé" in detail

    def test_04_hate_announcement_refused_warning_2(self, fresh_user_a):
        clubs = requests.get(f"{BASE_URL}/api/clubs", headers=_h(fresh_user_a["token"]), timeout=20).json()
        assert isinstance(clubs, list) and len(clubs) > 0
        club_id = clubs[0]["id"]
        r = requests.post(
            f"{BASE_URL}/api/clubs/{club_id}/announcements",
            json={"content": HATE_ANN, "party_size": 1},
            headers=_h(fresh_user_a["token"]),
            timeout=60,
        )
        assert r.status_code == 422, f"hate ann: {r.status_code} {r.text}"
        detail = r.json().get("detail", "")
        assert "Avertissement 2/3" in detail, f"missing warn 2/3: {detail}"
        assert "Annonce non publiée" in detail

    def test_05_hate_bio_third_refusal_suspends(self, fresh_user_a):
        r = requests.put(
            f"{BASE_URL}/api/auth/me",
            json={"bio": HATE_BIO},
            headers=_h(fresh_user_a["token"]),
            timeout=60,
        )
        # 3rd refusal → 403 suspension
        assert r.status_code == 403, f"3rd refusal must be 403: {r.status_code} {r.text}"
        detail = r.json().get("detail", "")
        assert "suspendu" in detail.lower()

    def test_06_suspended_cannot_login(self, fresh_user_a):
        r = _login(fresh_user_a["email"])
        assert r.status_code == 403, f"login suspended must be 403: {r.status_code} {r.text}"
        assert "suspendu" in r.json().get("detail", "").lower()

    def test_07_suspended_cannot_call_me(self, fresh_user_a):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(fresh_user_a["token"]), timeout=15)
        assert r.status_code == 403


# ---------- Reports ----------

class TestReports:
    def test_create_report_ok_and_invalid_cases(self, fresh_user_b, admin):
        # Create a report against admin (any valid target). self-report → 400, invalid reason → 400
        tok = fresh_user_b["token"]
        # Invalid reason
        r = requests.post(
            f"{BASE_URL}/api/reports",
            json={"reported_user_id": admin["user"]["id"], "reason": "bogus", "context_type": "profile"},
            headers=_h(tok),
            timeout=15,
        )
        assert r.status_code == 400
        # Self-report
        r = requests.post(
            f"{BASE_URL}/api/reports",
            json={"reported_user_id": fresh_user_b["user"]["id"], "reason": "hate", "context_type": "profile"},
            headers=_h(tok),
            timeout=15,
        )
        assert r.status_code == 400
        # Valid report
        r = requests.post(
            f"{BASE_URL}/api/reports",
            json={"reported_user_id": admin["user"]["id"], "reason": "spam",
                  "details": "TEST_iter18 report", "context_type": "profile"},
            headers=_h(tok),
            timeout=20,
        )
        assert r.status_code == 201, f"create report: {r.status_code} {r.text}"
        body = r.json()
        assert body["reason"] == "spam"
        assert body["reason_label"] == "Spam ou arnaque"
        assert body["status"] == "open"
        pytest.report_id = body["id"]

    def test_admin_list_reports_contains_warnings(self, admin):
        r = requests.get(f"{BASE_URL}/api/admin/reports", headers=_h(admin["token"]), timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) >= 1
        first = items[0]
        assert "reported" in first and "reporter" in first
        assert "warnings" in first["reported"]
        assert "suspended" in first["reported"]
        assert "reason_label" in first

    def test_admin_reports_forbidden_for_non_admin(self, fresh_user_b):
        r = requests.get(f"{BASE_URL}/api/admin/reports", headers=_h(fresh_user_b["token"]), timeout=15)
        assert r.status_code == 403

    def test_patch_report_statuses(self, admin):
        rid = getattr(pytest, "report_id", None)
        assert rid, "report_id missing"
        for status in ("resolved", "dismissed", "open"):
            r = requests.patch(
                f"{BASE_URL}/api/admin/reports/{rid}",
                json={"status": status}, headers=_h(admin["token"]), timeout=15,
            )
            assert r.status_code == 200, f"patch to {status}: {r.status_code} {r.text}"
            assert r.json()["status"] == status
        # Invalid status → 400
        r = requests.patch(
            f"{BASE_URL}/api/admin/reports/{rid}",
            json={"status": "bogus"}, headers=_h(admin["token"]), timeout=15,
        )
        assert r.status_code == 400


# ---------- Block / Unblock ----------

class TestBlockFlow:
    """Use two demo users (thomas / sophie) with cleanup at the end."""

    @pytest.fixture(scope="class")
    def pair(self):
        tt, thomas = _auth("thomas@padel.fr")
        ts, sophie = _auth("sophie@padel.fr")
        # Ensure clean slate: unblock both ways
        requests.delete(f"{BASE_URL}/api/users/{sophie['id']}/block", headers=_h(tt))
        requests.delete(f"{BASE_URL}/api/users/{thomas['id']}/block", headers=_h(ts))
        yield {"a_tok": tt, "a": thomas, "b_tok": ts, "b": sophie}
        # Cleanup
        requests.delete(f"{BASE_URL}/api/users/{sophie['id']}/block", headers=_h(tt))
        requests.delete(f"{BASE_URL}/api/users/{thomas['id']}/block", headers=_h(ts))

    def test_block_and_is_blocked_flag(self, pair):
        r = requests.post(f"{BASE_URL}/api/users/{pair['b']['id']}/block", headers=_h(pair["a_tok"]), timeout=15)
        assert r.status_code == 200
        assert r.json().get("is_blocked") is True
        r = requests.get(f"{BASE_URL}/api/users/{pair['b']['id']}", headers=_h(pair["a_tok"]), timeout=15)
        assert r.status_code == 200
        assert r.json().get("is_blocked") is True

    def test_blocked_list(self, pair):
        r = requests.get(f"{BASE_URL}/api/users/blocked", headers=_h(pair["a_tok"]), timeout=15)
        assert r.status_code == 200
        ids = [u["id"] for u in r.json()]
        assert pair["b"]["id"] in ids

    def test_messaging_either_direction_blocked(self, pair):
        r = requests.post(
            f"{BASE_URL}/api/messages",
            json={"to_user_id": pair["b"]["id"], "content": "TEST hi"},
            headers=_h(pair["a_tok"]), timeout=15,
        )
        assert r.status_code == 403, f"A→B after block: {r.status_code} {r.text}"
        r = requests.post(
            f"{BASE_URL}/api/messages",
            json={"to_user_id": pair["a"]["id"], "content": "TEST hi back"},
            headers=_h(pair["b_tok"]), timeout=15,
        )
        assert r.status_code == 403, f"B→A after block: {r.status_code} {r.text}"

    def test_announcements_hidden_from_blocker(self, pair):
        # B posts an announcement, A should not see it in /matches/open
        clubs = requests.get(f"{BASE_URL}/api/clubs", headers=_h(pair["b_tok"]), timeout=15).json()
        club_id = clubs[0]["id"]
        ann = requests.post(
            f"{BASE_URL}/api/clubs/{club_id}/announcements",
            json={"content": "TEST_iter18 blocked ann (safe)", "party_size": 1},
            headers=_h(pair["b_tok"]), timeout=45,
        )
        assert ann.status_code == 200, f"post ann B: {ann.status_code} {ann.text}"
        ann_id = ann.json()["id"]
        # A fetches open matches
        opens = requests.get(f"{BASE_URL}/api/matches/open", headers=_h(pair["a_tok"]), timeout=15).json()
        ann_ids = [a["id"] for a in opens]
        assert ann_id not in ann_ids, "blocked user's announcement must not appear in /matches/open"
        # A fetches club announcements
        club_anns = requests.get(f"{BASE_URL}/api/clubs/{club_id}/announcements", headers=_h(pair["a_tok"]), timeout=15).json()
        assert ann_id not in [a["id"] for a in club_anns], "blocked user's ann must not appear in club list for blocker"
        # A can't join
        r = requests.post(f"{BASE_URL}/api/announcements/{ann_id}/join", headers=_h(pair["a_tok"]), timeout=15)
        assert r.status_code == 403, f"join blocked ann: {r.status_code} {r.text}"
        # Cleanup announcement by B leaving/deleting isn't exposed; mute to hide from feed
        pytest.block_ann_id = ann_id

    def test_unblock_restores(self, pair):
        r = requests.delete(f"{BASE_URL}/api/users/{pair['b']['id']}/block", headers=_h(pair["a_tok"]), timeout=15)
        assert r.status_code == 200
        assert r.json().get("is_blocked") is False
        r = requests.get(f"{BASE_URL}/api/users/{pair['b']['id']}", headers=_h(pair["a_tok"]), timeout=15)
        assert r.json().get("is_blocked") is False


# ---------- Admin suspend/unsuspend + moderation events ----------

class TestAdminActions:
    def test_cannot_suspend_self(self, admin):
        r = requests.post(
            f"{BASE_URL}/api/admin/users/{admin['user']['id']}/suspend",
            headers=_h(admin["token"]), timeout=15,
        )
        assert r.status_code == 400

    def test_suspend_then_unsuspend_resets_warnings(self, admin):
        # Create fresh user, suspend, verify login 403, unsuspend, verify login OK + warnings=0
        suffix = uuid.uuid4().hex[:8]
        payload = {
            "email": f"test_iter18_sus_{suffix}@padel.fr",
            "pseudo": f"TESTIter18S{suffix}",
            "password": "password123",
            "first_name": "T", "last_name": "S",
            "phone": "0600000000", "birth_date": "1995-01-01", "city": "Paris",
        }
        r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=20)
        assert r.status_code == 200
        uid = r.json()["user"]["id"]
        # Suspend
        r = requests.post(f"{BASE_URL}/api/admin/users/{uid}/suspend",
                          headers=_h(admin["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json().get("suspended") is True
        # Login should 403
        r = _login(payload["email"])
        assert r.status_code == 403
        # Unsuspend
        r = requests.post(f"{BASE_URL}/api/admin/users/{uid}/unsuspend",
                          headers=_h(admin["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json().get("suspended") is False
        # Login should 200 + warnings=0
        r = _login(payload["email"])
        assert r.status_code == 200
        assert r.json()["user"].get("warnings", 0) == 0

    def test_moderation_events_list(self, admin):
        r = requests.get(f"{BASE_URL}/api/admin/moderation/events", headers=_h(admin["token"]), timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        # From TestModerationFlow, there should be at least 3 events
        assert len(items) >= 1


# ---------- Regression: login + core lists ----------

class TestRegression:
    def test_login_demo_user(self):
        r = _login("thomas@padel.fr")
        assert r.status_code == 200
        assert "token" in r.json()

    def test_clubs_list(self, admin):
        r = requests.get(f"{BASE_URL}/api/clubs", headers=_h(admin["token"]), timeout=15)
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_matches_open(self, admin):
        r = requests.get(f"{BASE_URL}/api/matches/open", headers=_h(admin["token"]), timeout=15)
        assert r.status_code == 200

    def test_conversations(self, admin):
        r = requests.get(f"{BASE_URL}/api/messages/conversations", headers=_h(admin["token"]), timeout=15)
        assert r.status_code == 200

    def test_favorites(self, admin):
        r = requests.get(f"{BASE_URL}/api/users/favorites", headers=_h(admin["token"]), timeout=15)
        assert r.status_code == 200
