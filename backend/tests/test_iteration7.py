"""
Iteration 7 backend tests - PadelConnect
Focus: party_size feature (offline players already gathered) on announcements
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://padel-play-8.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email: str, password: str = "password123") -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def _register_fresh() -> str:
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "email": f"test_{suffix}@padel.fr",
        "password": "password123",
        "pseudo": f"Tester{suffix}",
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, f"register: {r.status_code} {r.text}"
    return r.json()["token"]


def _headers(token: str):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def marc_token():
    return _login("marc@padel.fr")


@pytest.fixture(scope="module")
def julie_token():
    return _login("julie@padel.fr")


@pytest.fixture(scope="module")
def kevin_token():
    return _login("kevin@padel.fr")


@pytest.fixture(scope="module")
def club_id(marc_token):
    r = requests.get(f"{API}/clubs", headers=_headers(marc_token), timeout=15)
    assert r.status_code == 200
    clubs = r.json()
    assert len(clubs) > 0
    return clubs[0]["id"]


# -------------- party_size / offline_count logic --------------

class TestPartySize:
    def test_create_party_size_2(self, marc_token, club_id):
        r = requests.post(
            f"{API}/clubs/{club_id}/announcements",
            headers=_headers(marc_token),
            json={"content": "TEST_iter7 party_size=2", "availability": "Sam 14h", "party_size": 2},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["offline_count"] == 1
        assert data["total_players"] == 2
        assert data["slots_left"] == 2
        assert data["is_full"] is False
        assert data["max_players"] == 4
        assert len(data["players"]) == 1

    def test_default_party_size_1(self, marc_token, club_id):
        r = requests.post(
            f"{API}/clubs/{club_id}/announcements",
            headers=_headers(marc_token),
            json={"content": "TEST_iter7 default"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["offline_count"] == 0
        assert data["total_players"] == 1
        assert data["slots_left"] == 3
        assert data["is_full"] is False

    def test_party_size_bounds(self, marc_token, club_id):
        for bad in [0, 5, -1]:
            r = requests.post(
                f"{API}/clubs/{club_id}/announcements",
                headers=_headers(marc_token),
                json={"content": "TEST_iter7 bad", "party_size": bad},
                timeout=15,
            )
            assert r.status_code in (400, 422), f"expected validation error for party_size={bad}: {r.status_code}"

    def test_party_size_4_is_full_at_creation(self, marc_token, club_id):
        r = requests.post(
            f"{API}/clubs/{club_id}/announcements",
            headers=_headers(marc_token),
            json={"content": "TEST_iter7 party=4", "party_size": 4},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["offline_count"] == 3
        assert data["total_players"] == 4
        assert data["slots_left"] == 0
        assert data["is_full"] is True


# -------------- join respects offline players --------------

class TestJoinWithOffline:
    def test_join_offline_cap(self, marc_token, julie_token, kevin_token, club_id):
        # Marc creates match party_size=3 => 1 app player + 2 offline
        r = requests.post(
            f"{API}/clubs/{club_id}/announcements",
            headers=_headers(marc_token),
            json={"content": "TEST_iter7 join offline", "party_size": 3},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        ann = r.json()
        ann_id = ann["id"]
        assert ann["offline_count"] == 2
        assert ann["total_players"] == 3
        assert ann["slots_left"] == 1

        # Julie joins => total should be 4 => is_full
        r2 = requests.post(f"{API}/announcements/{ann_id}/join", headers=_headers(julie_token), timeout=15)
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2["total_players"] == 4
        assert d2["is_full"] is True
        assert d2["slots_left"] == 0
        assert len(d2["players"]) == 2

        # Kevin tries to join => 409 Match complet
        r3 = requests.post(f"{API}/announcements/{ann_id}/join", headers=_headers(kevin_token), timeout=15)
        assert r3.status_code == 409, f"expected 409, got {r3.status_code}: {r3.text}"


# -------------- regression: list & backward compat --------------

class TestListAndBackCompat:
    def test_list_contains_offline_fields(self, marc_token, club_id):
        r = requests.get(f"{API}/clubs/{club_id}/announcements", headers=_headers(marc_token), timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        for it in items:
            assert "offline_count" in it
            assert "total_players" in it
            assert "slots_left" in it
            assert "is_full" in it
            # backward-compat: seeded/old items get offline_count=0
            assert it["offline_count"] >= 0
            assert it["total_players"] == len(it["players"]) + it["offline_count"]
            assert it["slots_left"] == max(0, 4 - it["total_players"])
            assert it["is_full"] == (it["total_players"] >= 4)


# -------------- regression: join/leave basic --------------

class TestJoinLeaveRegression:
    def test_join_then_leave(self, marc_token, julie_token, club_id):
        r = requests.post(
            f"{API}/clubs/{club_id}/announcements",
            headers=_headers(marc_token),
            json={"content": "TEST_iter7 regression join/leave", "party_size": 1},
            timeout=15,
        )
        ann_id = r.json()["id"]
        rj = requests.post(f"{API}/announcements/{ann_id}/join", headers=_headers(julie_token), timeout=15)
        assert rj.status_code == 200
        assert rj.json()["total_players"] == 2
        rl = requests.post(f"{API}/announcements/{ann_id}/leave", headers=_headers(julie_token), timeout=15)
        assert rl.status_code == 200
        assert rl.json()["total_players"] == 1

    def test_author_cannot_leave(self, marc_token, club_id):
        r = requests.post(
            f"{API}/clubs/{club_id}/announcements",
            headers=_headers(marc_token),
            json={"content": "TEST_iter7 author leave"},
            timeout=15,
        )
        ann_id = r.json()["id"]
        rl = requests.post(f"{API}/announcements/{ann_id}/leave", headers=_headers(marc_token), timeout=15)
        assert rl.status_code == 400


# -------------- regression: auth/health --------------

class TestHealth:
    def test_root(self):
        r = requests.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_fresh_register_login(self):
        tok = _register_fresh()
        assert isinstance(tok, str) and len(tok) > 10
