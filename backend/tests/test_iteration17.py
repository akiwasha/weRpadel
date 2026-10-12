"""
Iteration 17 — Backend regression post SDK57 upgrade (weRpadel).
Covers: /health, POST /api/auth/login, GET /api/clubs, GET /api/clubs/nearest,
GET /api/matches/open (incl. club_is_outdoor), GET /api/auth/me.
"""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "marc@padel.fr", "password": "password123"}
USER = {"email": "julie@padel.fr", "password": "password123"}


@pytest.fixture(scope="module")
def tok():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def H(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


class TestHealth:
    def test_health_200(self):
        # NOTE: health is served at /health (no /api prefix)
        r = requests.get(f"{BASE_URL}/health", timeout=10)
        assert r.status_code == 200, r.text


class TestAuth:
    def test_login_marc(self):
        r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("token")
        assert body.get("user", {}).get("email") == ADMIN["email"]

    def test_login_julie(self):
        r = requests.post(f"{API}/auth/login", json=USER, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("token")

    def test_login_wrong_password_401(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": "marc@padel.fr", "password": "wrong"},
                          timeout=15)
        assert r.status_code in (400, 401), r.text

    def test_me(self, tok):
        r = requests.get(f"{API}/auth/me", headers=H(tok), timeout=15)
        assert r.status_code == 200
        assert r.json().get("email") == ADMIN["email"]


class TestClubs:
    def test_clubs_list(self, tok):
        r = requests.get(f"{API}/clubs", headers=H(tok), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 10
        # schema spot-check
        c = data[0]
        for k in ("id", "name", "region"):
            assert k in c, f"missing key {k} in club: {c}"
        # mongodb _id should not leak
        assert "_id" not in c

    def test_clubs_nearest(self, tok):
        r = requests.get(f"{API}/clubs/nearest",
                         headers=H(tok), params={"q": "Paris"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, (list, dict))

    def test_clubs_nearest_unknown_city(self, tok):
        # The frontend shows a banner "Aucun club à ..." for unknown cities
        r = requests.get(f"{API}/clubs/nearest",
                         headers=H(tok), params={"q": "Rennes"}, timeout=15)
        assert r.status_code == 200, r.text


class TestMatchesOpen:
    def test_open_matches(self, tok):
        r = requests.get(f"{API}/matches/open", headers=H(tok), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        for item in data[:5]:
            assert "id" in item
            assert "club_is_outdoor" in item
            assert isinstance(item["club_is_outdoor"], bool)
            assert "_id" not in item
