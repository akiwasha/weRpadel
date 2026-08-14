"""Iteration 10 backend tests: clubs price_per_hour + suggest_club price + regressions."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password="password123"):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def marc():
    tok, u = _login("marc@padel.fr")
    return {"tok": tok, "user": u}


@pytest.fixture(scope="module")
def julie():
    tok, u = _login("julie@padel.fr")
    return {"tok": tok, "user": u}


# --------- Clubs price_per_hour ---------
class TestClubsPrice:
    def test_list_clubs_has_price_per_hour(self, marc):
        r = requests.get(f"{API}/clubs", headers=_h(marc["tok"]), timeout=30)
        assert r.status_code == 200
        clubs = r.json()
        assert len(clubs) >= 12
        # every seed club has a numeric price
        by_name = {c["name"]: c for c in clubs}
        assert "Padel Horizon Paris" in by_name
        assert by_name["Padel Horizon Paris"]["price_per_hour"] == 40
        assert "Padel Toulouse Sud" in by_name
        assert by_name["Padel Toulouse Sud"]["price_per_hour"] == 28
        # all seed prices numeric and in [10, 200]
        for c in clubs:
            if c["name"] in {
                "Padel Horizon Paris", "Club Padel Lyon Est", "Marseille Padel Beach",
                "Padel Toulouse Sud", "Bordeaux Padel Arena", "Nice Padel Club",
                "Padel Nantes Erdre", "Strasbourg Padel", "Lille Padel Nord",
                "Rennes Padel Ouest", "Montpellier Padel Sud", "Padel Grenoble Alpes",
            }:
                assert isinstance(c["price_per_hour"], (int, float))
                assert 10 <= c["price_per_hour"] <= 200

    def test_get_club_by_id_has_price(self, marc):
        r = requests.get(f"{API}/clubs", headers=_h(marc["tok"]), timeout=30)
        paris = [c for c in r.json() if c["name"] == "Padel Horizon Paris"][0]
        r = requests.get(f"{API}/clubs/{paris['id']}", headers=_h(marc["tok"]), timeout=30)
        assert r.status_code == 200
        assert r.json()["price_per_hour"] == 40


class TestSuggestClub:
    def test_create_club_with_price(self, marc):
        name = f"TEST_iter10_{uuid.uuid4().hex[:8]}"
        r = requests.post(f"{API}/clubs", headers=_h(marc["tok"]), json={
            "name": name, "city": "Testville", "region": "Ile-de-France",
            "address": "1 rue du test", "price_per_hour": 33,
        }, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["price_per_hour"] == 33
        # verify via GET
        r = requests.get(f"{API}/clubs/{data['id']}", headers=_h(marc["tok"]), timeout=30)
        assert r.status_code == 200
        assert r.json()["price_per_hour"] == 33

    def test_create_club_without_price_is_allowed(self, marc):
        name = f"TEST_iter10_nop_{uuid.uuid4().hex[:8]}"
        r = requests.post(f"{API}/clubs", headers=_h(marc["tok"]), json={
            "name": name, "city": "Testville", "region": "Bretagne",
        }, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["price_per_hour"] is None

    def test_create_club_price_out_of_range_rejected(self, marc):
        r = requests.post(f"{API}/clubs", headers=_h(marc["tok"]), json={
            "name": f"TEST_iter10_bad_{uuid.uuid4().hex[:8]}",
            "city": "X", "region": "Y", "price_per_hour": 999,
        }, timeout=30)
        assert r.status_code in (400, 422)

        r = requests.post(f"{API}/clubs", headers=_h(marc["tok"]), json={
            "name": f"TEST_iter10_bad2_{uuid.uuid4().hex[:8]}",
            "city": "X", "region": "Y", "price_per_hour": -5,
        }, timeout=30)
        assert r.status_code in (400, 422)


# --------- Regression essentials ---------
class TestRegression:
    def test_auth_still_works(self):
        r = requests.post(f"{API}/auth/login", json={"email": "marc@padel.fr", "password": "password123"}, timeout=30)
        assert r.status_code == 200
        assert "token" in r.json()

    def test_favorites_and_history_intact(self, marc):
        r = requests.get(f"{API}/users/favorites", headers=_h(marc["tok"]), timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        r = requests.get(f"{API}/matches/history", headers=_h(marc["tok"]), timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_history_serialization_has_is_full_and_status(self, marc):
        r = requests.get(f"{API}/matches/history", headers=_h(marc["tok"]), timeout=30)
        assert r.status_code == 200
        for a in r.json()[:10]:
            for k in ("is_full", "status", "total_players", "max_players", "match_date"):
                assert k in a
