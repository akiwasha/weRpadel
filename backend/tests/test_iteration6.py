"""Iteration 6 tests: 4-player match feature (join/leave endpoints + serialization fields)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or "https://padel-play-8.preview.emergentagent.com"
API = f"{BASE_URL}/api"


def _login(email, password="password123"):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"]


def _register(pseudo_prefix="TESTU"):
    email = f"test_{uuid.uuid4().hex[:8]}@padel.fr"
    pseudo = f"{pseudo_prefix}_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "password123", "pseudo": pseudo}, timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"]


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


def _first_club_id(token):
    r = requests.get(f"{API}/clubs", headers=_auth(token), timeout=30)
    assert r.status_code == 200
    clubs = r.json()
    assert len(clubs) > 0
    return clubs[0]["id"]


# ---------- Serializer fields on GET /clubs/{id}/announcements ----------
class TestAnnouncementSerializer:
    def test_create_and_list_announcement_shape(self):
        marc_tok, marc = _login("marc@padel.fr")
        club_id = _first_club_id(marc_tok)

        # Create an announcement
        r = requests.post(
            f"{API}/clubs/{club_id}/announcements",
            headers=_auth(marc_tok),
            json={"content": "TEST_ iter6 recherche partenaires", "availability": "Sam 14h"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        ann = r.json()

        # Verify shape at creation
        for key in ["id", "club_id", "author", "content", "players", "max_players", "slots_left", "is_full", "is_member", "is_author"]:
            assert key in ann, f"missing {key} in create response"
        assert ann["max_players"] == 4
        assert ann["is_full"] is False
        assert ann["is_author"] is True
        assert ann["is_member"] is True
        assert ann["slots_left"] == 3
        assert isinstance(ann["players"], list) and len(ann["players"]) == 1
        assert ann["players"][0]["id"] == marc["id"], "author must be auto-joined"

        # Verify via GET list
        r2 = requests.get(f"{API}/clubs/{club_id}/announcements", headers=_auth(marc_tok), timeout=30)
        assert r2.status_code == 200
        items = r2.json()
        mine = next((i for i in items if i["id"] == ann["id"]), None)
        assert mine is not None, "created annonce not returned"
        assert mine["max_players"] == 4
        assert mine["slots_left"] == 3
        assert mine["is_author"] is True and mine["is_member"] is True

        # cleanup: leave will 400 (author) — we accept the leftover in the test DB


# ---------- Join / Leave flow ----------
class TestJoinLeaveFlow:
    def test_join_increments_players_and_leave_removes(self):
        # Marc creates the annonce, Julie joins then leaves
        marc_tok, marc = _login("marc@padel.fr")
        julie_tok, julie = _login("julie@padel.fr")
        club_id = _first_club_id(marc_tok)

        create = requests.post(
            f"{API}/clubs/{club_id}/announcements",
            headers=_auth(marc_tok),
            json={"content": "TEST_ iter6 join/leave", "availability": None},
            timeout=30,
        )
        assert create.status_code == 200
        ann = create.json()
        ann_id = ann["id"]

        # From Julie's perspective before joining
        list_r = requests.get(f"{API}/clubs/{club_id}/announcements", headers=_auth(julie_tok), timeout=30)
        item = next(i for i in list_r.json() if i["id"] == ann_id)
        assert item["is_member"] is False
        assert item["is_author"] is False
        assert item["slots_left"] == 3
        assert len(item["players"]) == 1

        # Julie joins
        jr = requests.post(f"{API}/announcements/{ann_id}/join", headers=_auth(julie_tok), timeout=30)
        assert jr.status_code == 200, jr.text
        after_join = jr.json()
        assert after_join["is_member"] is True
        assert after_join["is_author"] is False
        assert after_join["slots_left"] == 2
        assert len(after_join["players"]) == 2
        assert any(p["id"] == julie["id"] for p in after_join["players"])

        # Join again = idempotent (no-op)
        jr2 = requests.post(f"{API}/announcements/{ann_id}/join", headers=_auth(julie_tok), timeout=30)
        assert jr2.status_code == 200
        assert len(jr2.json()["players"]) == 2

        # Julie leaves
        lv = requests.post(f"{API}/announcements/{ann_id}/leave", headers=_auth(julie_tok), timeout=30)
        assert lv.status_code == 200, lv.text
        after_leave = lv.json()
        assert after_leave["is_member"] is False
        assert after_leave["slots_left"] == 3
        assert len(after_leave["players"]) == 1

    def test_author_cannot_leave_400(self):
        marc_tok, marc = _login("marc@padel.fr")
        club_id = _first_club_id(marc_tok)
        create = requests.post(
            f"{API}/clubs/{club_id}/announcements",
            headers=_auth(marc_tok),
            json={"content": "TEST_ iter6 author leave"},
            timeout=30,
        )
        ann_id = create.json()["id"]
        r = requests.post(f"{API}/announcements/{ann_id}/leave", headers=_auth(marc_tok), timeout=30)
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"

    def test_match_full_returns_409(self):
        # 4 players fill the match; a 5th user gets 409
        marc_tok, marc = _login("marc@padel.fr")
        julie_tok, _ = _login("julie@padel.fr")
        club_id = _first_club_id(marc_tok)

        create = requests.post(
            f"{API}/clubs/{club_id}/announcements",
            headers=_auth(marc_tok),
            json={"content": "TEST_ iter6 full match"},
            timeout=30,
        )
        ann_id = create.json()["id"]

        # Register 3 fresh users, join
        tokens = []
        for _ in range(3):
            t, _u = _register()
            tokens.append(t)

        # Marc is author (1). Julie joins (2), plus 2 fresh -> total 4
        r = requests.post(f"{API}/announcements/{ann_id}/join", headers=_auth(julie_tok), timeout=30)
        assert r.status_code == 200
        r = requests.post(f"{API}/announcements/{ann_id}/join", headers=_auth(tokens[0]), timeout=30)
        assert r.status_code == 200
        r = requests.post(f"{API}/announcements/{ann_id}/join", headers=_auth(tokens[1]), timeout=30)
        assert r.status_code == 200
        state = r.json()
        assert state["is_full"] is True
        assert state["slots_left"] == 0
        assert len(state["players"]) == 4

        # 5th user attempts to join -> 409
        r_full = requests.post(f"{API}/announcements/{ann_id}/join", headers=_auth(tokens[2]), timeout=30)
        assert r_full.status_code == 409, f"expected 409, got {r_full.status_code} {r_full.text}"

    def test_join_nonexistent_returns_404(self):
        marc_tok, _ = _login("marc@padel.fr")
        r = requests.post(f"{API}/announcements/{uuid.uuid4()}/join", headers=_auth(marc_tok), timeout=30)
        assert r.status_code == 404
        r2 = requests.post(f"{API}/announcements/{uuid.uuid4()}/leave", headers=_auth(marc_tok), timeout=30)
        assert r2.status_code == 404


# ---------- Regression: existing endpoints still respond ----------
class TestRegression:
    def test_list_clubs_ok(self):
        tok, _ = _login("marc@padel.fr")
        r = requests.get(f"{API}/clubs", headers=_auth(tok), timeout=30)
        assert r.status_code == 200
        clubs = r.json()
        assert len(clubs) >= 12
        assert "announcements_count" in clubs[0]

    def test_unread_count_ok(self):
        tok, _ = _login("marc@padel.fr")
        r = requests.get(f"{API}/messages/unread_count", headers=_auth(tok), timeout=30)
        assert r.status_code == 200
        assert "count" in r.json()

    def test_auth_me_ok(self):
        tok, _ = _login("marc@padel.fr")
        r = requests.get(f"{API}/auth/me", headers=_auth(tok), timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == "marc@padel.fr"
