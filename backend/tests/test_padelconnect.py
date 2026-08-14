"""PadelConnect backend integration tests."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://padel-play-8.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

MARC = {"email": "marc@padel.fr", "password": "password123"}
JULIE = {"email": "julie@padel.fr", "password": "password123"}


@pytest.fixture(scope="module")
def marc_token():
    r = requests.post(f"{API}/auth/login", json=MARC, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def julie_token():
    r = requests.post(f"{API}/auth/login", json=JULIE, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---- AUTH ----
class TestAuth:
    def test_login_marc(self):
        r = requests.post(f"{API}/auth/login", json=MARC, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and "user" in data
        assert data["user"]["email"] == "marc@padel.fr"
        assert data["user"]["pseudo"] == "MarcPadel"

    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": "marc@padel.fr", "password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_register_and_me(self):
        suffix = uuid.uuid4().hex[:8]
        payload = {"email": f"TEST_{suffix}@padel.fr", "password": "password123", "pseudo": f"TEST_{suffix}"}
        r = requests.post(f"{API}/auth/register", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        me = requests.get(f"{API}/auth/me", headers=h(token), timeout=30)
        assert me.status_code == 200
        assert me.json()["email"] == payload["email"].lower()

    def test_register_short_password(self):
        r = requests.post(f"{API}/auth/register", json={"email": "x@x.fr", "password": "123", "pseudo": "shorty"}, timeout=30)
        assert r.status_code == 422

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401

    def test_update_me(self, marc_token):
        r = requests.put(f"{API}/auth/me", headers=h(marc_token), json={"bio": "Test bio update", "level": "Confirmé"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["bio"] == "Test bio update"
        assert data["level"] == "Confirmé"


# ---- CLUBS ----
class TestClubs:
    def test_list_clubs(self, marc_token):
        r = requests.get(f"{API}/clubs", headers=h(marc_token), timeout=30)
        assert r.status_code == 200
        clubs = r.json()
        assert len(clubs) >= 12
        assert "name" in clubs[0] and "region" in clubs[0]
        assert "announcements_count" in clubs[0]

    def test_regions(self, marc_token):
        r = requests.get(f"{API}/clubs/regions", headers=h(marc_token), timeout=30)
        assert r.status_code == 200
        regions = r.json()
        assert isinstance(regions, list) and len(regions) >= 5
        assert "Île-de-France" in regions

    def test_club_detail(self, marc_token):
        clubs = requests.get(f"{API}/clubs", headers=h(marc_token), timeout=30).json()
        cid = clubs[0]["id"]
        r = requests.get(f"{API}/clubs/{cid}", headers=h(marc_token), timeout=30)
        assert r.status_code == 200
        assert r.json()["id"] == cid

    def test_suggest_club(self, marc_token):
        payload = {"name": f"TEST_Club_{uuid.uuid4().hex[:6]}", "city": "TestCity", "region": "TestRegion"}
        r = requests.post(f"{API}/clubs", headers=h(marc_token), json=payload, timeout=30)
        assert r.status_code == 200
        c = r.json()
        assert c["name"] == payload["name"]
        assert c["approved"] is False

    def test_search_clubs(self, marc_token):
        r = requests.get(f"{API}/clubs", headers=h(marc_token), params={"search": "Paris"}, timeout=30)
        assert r.status_code == 200
        assert any("Paris" in c["city"] or "Paris" in c["name"] for c in r.json())


# ---- ANNOUNCEMENTS ----
class TestAnnouncements:
    def test_create_and_list(self, marc_token):
        clubs = requests.get(f"{API}/clubs", headers=h(marc_token), timeout=30).json()
        cid = clubs[0]["id"]
        content = f"TEST announcement {uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/clubs/{cid}/announcements", headers=h(marc_token),
                          json={"content": content, "availability": "Samedi 14h"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["content"] == content
        assert data["author"]["pseudo"] == "MarcPadel"

        lst = requests.get(f"{API}/clubs/{cid}/announcements", headers=h(marc_token), timeout=30)
        assert lst.status_code == 200
        assert any(a["content"] == content for a in lst.json())


# ---- MESSAGES ----
class TestMessages:
    def test_send_and_get_conversation(self, marc_token, julie_token):
        me_j = requests.get(f"{API}/auth/me", headers=h(julie_token), timeout=30).json()
        julie_id = me_j["id"]
        content = f"TEST DM {uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/messages", headers=h(marc_token),
                          json={"to_user_id": julie_id, "content": content}, timeout=30)
        assert r.status_code == 200, r.text

        # julie sees conversation with unread=1
        convs = requests.get(f"{API}/messages/conversations", headers=h(julie_token), timeout=30)
        assert convs.status_code == 200
        found = [c for c in convs.json() if c["last_message"] == content]
        assert found and found[0]["unread"] >= 1

        # julie fetches thread -> marks read
        msgs = requests.get(f"{API}/messages/{ requests.get(f'{API}/auth/me', headers=h(marc_token)).json()['id'] }",
                            headers=h(julie_token), timeout=30)
        assert msgs.status_code == 200
        assert any(m["content"] == content for m in msgs.json())

    def test_self_message_rejected(self, marc_token):
        me = requests.get(f"{API}/auth/me", headers=h(marc_token), timeout=30).json()
        r = requests.post(f"{API}/messages", headers=h(marc_token),
                          json={"to_user_id": me["id"], "content": "hi"}, timeout=30)
        assert r.status_code == 400


# ---- RATINGS ----
class TestRatings:
    def test_rate_user(self, marc_token, julie_token):
        julie_id = requests.get(f"{API}/auth/me", headers=h(julie_token), timeout=30).json()["id"]
        r = requests.post(f"{API}/users/{julie_id}/rate", headers=h(marc_token), json={"stars": 5}, timeout=30)
        assert r.status_code == 200
        assert r.json()["reliability_count"] >= 1
        # update same rating (should not increment count)
        c1 = r.json()["reliability_count"]
        r2 = requests.post(f"{API}/users/{julie_id}/rate", headers=h(marc_token), json={"stars": 4}, timeout=30)
        assert r2.json()["reliability_count"] == c1

    def test_cannot_rate_self(self, marc_token):
        me = requests.get(f"{API}/auth/me", headers=h(marc_token), timeout=30).json()
        r = requests.post(f"{API}/users/{me['id']}/rate", headers=h(marc_token), json={"stars": 5}, timeout=30)
        assert r.status_code == 400
