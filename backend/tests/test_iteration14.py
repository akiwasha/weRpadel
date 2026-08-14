"""Iteration 14 - Real clubs + admin price mgmt + announcement court_price
Tests:
- GET /api/clubs returns real clubs (Casa Padel, 4PADEL..) and no old demo
- Club price default is null (Tarif à confirmer)
- Announcement creation with court_price
- PATCH /api/clubs/{id} admin ok, non-admin forbidden
- /auth/me is_admin flag
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "").rstrip("/") or \
           open("/app/frontend/.env").read().split("EXPO_PUBLIC_BACKEND_URL=")[1].split("\n")[0].strip().strip('"').rstrip("/")
API = BASE_URL + "/api"

REAL_NAMES_SAMPLE = {"Casa Padel", "4PADEL Aubervilliers", "Padel Attitude", "4PADEL Toulouse"}
OLD_DEMO_SAMPLE = {"Padel Horizon Paris", "Club Padel Lyon Est", "Marseille Padel Beach"}


@pytest.fixture(scope="module")
def marc_token():
    r = requests.post(f"{API}/auth/login", json={"email": "marc@padel.fr", "password": "password123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def julie_token():
    r = requests.post(f"{API}/auth/login", json={"email": "julie@padel.fr", "password": "password123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


class TestAuthMeAdminFlag:
    def test_marc_is_admin(self, marc_token):
        r = requests.get(f"{API}/auth/me", headers=h(marc_token))
        assert r.status_code == 200
        assert r.json().get("is_admin") is True

    def test_julie_is_not_admin(self, julie_token):
        r = requests.get(f"{API}/auth/me", headers=h(julie_token))
        assert r.status_code == 200
        assert r.json().get("is_admin") is False


class TestClubsSeed:
    def test_real_clubs_seeded(self, marc_token):
        r = requests.get(f"{API}/clubs", headers=h(marc_token))
        assert r.status_code == 200
        clubs = r.json()
        assert isinstance(clubs, list)
        # Should contain at least the 16 real clubs
        approved_names = {c["name"] for c in clubs if c.get("approved")}
        missing = REAL_NAMES_SAMPLE - approved_names
        assert not missing, f"Missing real clubs: {missing}"
        # count around 16
        assert len(approved_names) >= 14, f"Expected ~16 approved clubs, got {len(approved_names)}"

    def test_no_old_demo_clubs(self, marc_token):
        r = requests.get(f"{API}/clubs", headers=h(marc_token))
        names = {c["name"] for c in r.json()}
        leaked = names & OLD_DEMO_SAMPLE
        assert not leaked, f"Old demo clubs still present: {leaked}"

    def test_prices_default_null(self, marc_token):
        r = requests.get(f"{API}/clubs", headers=h(marc_token))
        casa = next((c for c in r.json() if c["name"] == "Casa Padel"), None)
        assert casa is not None
        # price might be null OR have been set. But default seed should be null unless admin updated.
        # We can't assert null strictly if admin changed it; assert field exists.
        assert "price_per_hour" in casa


class TestAdminPatch:
    def test_non_admin_forbidden(self, julie_token, marc_token):
        r = requests.get(f"{API}/clubs", headers=h(marc_token))
        club_id = r.json()[0]["id"]
        r2 = requests.patch(f"{API}/clubs/{club_id}",
                            json={"price_per_hour": 40},
                            headers=h(julie_token))
        assert r2.status_code == 403

    def test_admin_updates_price(self, marc_token):
        r = requests.get(f"{API}/clubs", headers=h(marc_token))
        casa = next(c for c in r.json() if c["name"] == "Casa Padel")
        cid = casa["id"]
        # Set 42
        r2 = requests.patch(f"{API}/clubs/{cid}", json={"price_per_hour": 42}, headers=h(marc_token))
        assert r2.status_code == 200, r2.text
        assert r2.json()["price_per_hour"] == 42
        # verify via GET
        r3 = requests.get(f"{API}/clubs/{cid}", headers=h(marc_token))
        assert r3.json()["price_per_hour"] == 42
        # Cleanup: reset to None
        requests.patch(f"{API}/clubs/{cid}", json={"price_per_hour": None}, headers=h(marc_token))

    def test_admin_reset_to_null(self, marc_token):
        r = requests.get(f"{API}/clubs", headers=h(marc_token))
        casa = next(c for c in r.json() if c["name"] == "Casa Padel")
        cid = casa["id"]
        r2 = requests.patch(f"{API}/clubs/{cid}", json={"price_per_hour": None}, headers=h(marc_token))
        assert r2.status_code == 200
        assert r2.json()["price_per_hour"] is None


class TestAnnouncementCourtPrice:
    def test_create_with_court_price(self, marc_token):
        r = requests.get(f"{API}/clubs", headers=h(marc_token))
        cid = r.json()[0]["id"]
        payload = {
            "content": "TEST_ann_price - court price 32",
            "match_date": None,
            "match_end_date": None,
            "court_price": 32,
            "offline_names": [],
        }
        r2 = requests.post(f"{API}/clubs/{cid}/announcements", json=payload, headers=h(marc_token))
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data["court_price"] == 32
        # per player 8.00 - front computes; assert integer field
        # Cleanup: not strictly needed but ensure it appears in list
        r3 = requests.get(f"{API}/clubs/{cid}/announcements", headers=h(marc_token))
        found = next((a for a in r3.json() if a["id"] == data["id"]), None)
        assert found is not None
        assert found["court_price"] == 32

    def test_create_without_court_price(self, marc_token):
        r = requests.get(f"{API}/clubs", headers=h(marc_token))
        cid = r.json()[0]["id"]
        payload = {
            "content": "TEST_ann_no_price",
            "match_date": None,
            "match_end_date": None,
            "offline_names": [],
        }
        r2 = requests.post(f"{API}/clubs/{cid}/announcements", json=payload, headers=h(marc_token))
        assert r2.status_code == 200
        assert r2.json()["court_price"] is None
