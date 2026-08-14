"""
Iteration 12: Test private user fields (first_name, last_name, phone, birth_date, city)
- Register requires 5 new fields (422 if missing)
- /auth/me returns private fields for authenticated user
- PUT /auth/me updates private fields
- Public endpoints (GET /users/{id}, GET /clubs/{id}/announcements) do NOT leak private fields
- Seeded accounts still login, private fields = null
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/')
PRIVATE_FIELDS = ["email", "first_name", "last_name", "phone", "birth_date", "city"]


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def new_user(s):
    ts = int(time.time() * 1000)
    payload = {
        "email": f"e2e_{ts}@padel.fr",
        "password": "password123",
        "pseudo": f"E2E{ts}",
        "first_name": "Jean",
        "last_name": "Dupont",
        "phone": "0612345678",
        "birth_date": "1990-05-15",
        "city": "Paris",
    }
    r = s.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    return {**payload, "token": data["token"], "user": data["user"]}


# ---------- Register ----------
class TestRegister:
    def test_register_returns_private_fields(self, new_user):
        u = new_user["user"]
        assert u["email"] == new_user["email"]
        assert u["first_name"] == "Jean"
        assert u["last_name"] == "Dupont"
        assert u["phone"] == "0612345678"
        assert u["birth_date"] == "1990-05-15"
        assert u["city"] == "Paris"
        assert u["pseudo"].startswith("E2E")

    def test_register_missing_fields_returns_422(self, s):
        ts = int(time.time() * 1000)
        payload = {
            "email": f"e2e_bad_{ts}@padel.fr",
            "password": "password123",
            "pseudo": f"EBAD{ts}",
        }
        r = s.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"

    def test_register_missing_only_birthdate_422(self, s):
        ts = int(time.time() * 1000)
        payload = {
            "email": f"e2e_bd_{ts}@padel.fr",
            "password": "password123",
            "pseudo": f"EBD{ts}",
            "first_name": "A",
            "last_name": "B",
            "phone": "0611112222",
            "city": "Lyon",
        }
        r = s.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert r.status_code == 422


# ---------- Login / /auth/me ----------
class TestAuthMe:
    def test_login_new_user_returns_private(self, s, new_user):
        r = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": new_user["email"], "password": new_user["password"],
        })
        assert r.status_code == 200
        u = r.json()["user"]
        for f in PRIVATE_FIELDS:
            assert f in u, f"Missing {f} in login user"
        assert u["first_name"] == "Jean"
        assert u["city"] == "Paris"

    def test_auth_me_new_user(self, s, new_user):
        headers = {"Authorization": f"Bearer {new_user['token']}"}
        r = s.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == new_user["email"]
        assert u["first_name"] == "Jean"
        assert u["last_name"] == "Dupont"
        assert u["phone"] == "0612345678"
        assert u["birth_date"] == "1990-05-15"
        assert u["city"] == "Paris"


# ---------- Seed accounts regression ----------
class TestSeedAccounts:
    @pytest.mark.parametrize("email", [
        "marc@padel.fr", "julie@padel.fr", "thomas@padel.fr", "sophie@padel.fr",
    ])
    def test_seed_login_and_me(self, s, email):
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "password123"})
        assert r.status_code == 200, f"login failed: {r.text}"
        token = r.json()["token"]
        u = r.json()["user"]
        # Private fields present, and should be null (not renseignés)
        for f in ["first_name", "last_name", "phone", "birth_date", "city"]:
            assert f in u, f"Missing key {f}"
            assert u[f] is None, f"Seeded {email} should have {f}=None, got {u[f]!r}"
        # And /auth/me must not error
        r2 = s.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200
        me = r2.json()
        for f in ["first_name", "last_name", "phone", "birth_date", "city"]:
            assert me[f] is None


# ---------- PUT /auth/me ----------
class TestUpdateMe:
    def test_update_private_fields(self, s, new_user):
        headers = {"Authorization": f"Bearer {new_user['token']}"}
        payload = {
            "first_name": "Jean-Updated",
            "last_name": "Dupont-Updated",
            "phone": "0699999999",
            "birth_date": "1991-06-20",
            "city": "Lyon",
        }
        r = s.put(f"{BASE_URL}/api/auth/me", json=payload, headers=headers)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["first_name"] == "Jean-Updated"
        assert u["last_name"] == "Dupont-Updated"
        assert u["phone"] == "0699999999"
        assert u["birth_date"] == "1991-06-20"
        assert u["city"] == "Lyon"

        # Verify persistence via GET /auth/me
        r2 = s.get(f"{BASE_URL}/api/auth/me", headers=headers)
        u2 = r2.json()
        assert u2["city"] == "Lyon"
        assert u2["birth_date"] == "1991-06-20"


# ---------- Privacy: public endpoints must NOT leak private fields ----------
PRIVATE_LEAK_KEYS = ["email", "first_name", "last_name", "phone", "birth_date", "city"]


class TestPrivacy:
    def test_get_user_public_no_private_leak(self, s, new_user):
        # Login as Marc (another user) and fetch new_user's public profile
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "marc@padel.fr", "password": "password123"})
        assert r.status_code == 200
        marc_token = r.json()["token"]
        headers = {"Authorization": f"Bearer {marc_token}"}

        r2 = s.get(f"{BASE_URL}/api/users/{new_user['user']['id']}", headers=headers)
        assert r2.status_code == 200, r2.text
        u = r2.json()
        for k in PRIVATE_LEAK_KEYS:
            assert k not in u, f"PRIVACY LEAK: {k} exposed in GET /users/{{id}}: {u}"
        # Should still have public fields
        for k in ["id", "pseudo", "level", "reliability_avg", "reliability_count", "verified"]:
            assert k in u

    def test_announcements_public_no_private_leak(self, s, new_user):
        # Marc token
        marc = s.post(f"{BASE_URL}/api/auth/login", json={"email": "marc@padel.fr", "password": "password123"}).json()
        marc_token = marc["token"]
        headers = {"Authorization": f"Bearer {marc_token}"}

        # Pick a club and create an announcement as new_user
        clubs = s.get(f"{BASE_URL}/api/clubs", headers=headers).json()
        assert len(clubs) > 0
        club_id = clubs[0]["id"]

        new_headers = {"Authorization": f"Bearer {new_user['token']}"}
        ann_payload = {"content": "Test privacy announcement", "party_size": 1}
        r_ann = s.post(f"{BASE_URL}/api/clubs/{club_id}/announcements", json=ann_payload, headers=new_headers)
        assert r_ann.status_code == 200, r_ann.text

        # Marc joins to become a player
        ann_id = r_ann.json()["id"]
        s.post(f"{BASE_URL}/api/announcements/{ann_id}/join", headers=headers)

        # Marc lists announcements
        r_list = s.get(f"{BASE_URL}/api/clubs/{club_id}/announcements", headers=headers)
        assert r_list.status_code == 200
        anns = r_list.json()
        assert len(anns) > 0
        for a in anns:
            author = a.get("author") or {}
            for k in PRIVATE_LEAK_KEYS:
                assert k not in author, f"PRIVACY LEAK in author: {k} exposed. Author: {author}"
            for p in a.get("players", []):
                for k in PRIVATE_LEAK_KEYS:
                    assert k not in p, f"PRIVACY LEAK in players: {k} exposed. Player: {p}"
