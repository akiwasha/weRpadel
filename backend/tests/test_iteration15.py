"""
Iteration 15 backend tests:
- GET /api/matches/open with filters (level, region, search, date)
- GET /api/clubs/nearest?q=... nearest clubs (distance sorted, incl. no-match fallback)
- GET /api/clubs/{id}/weather (outdoor + indoor)
- PATCH /api/clubs/{id} admin toggling is_outdoor / price_per_hour preservation and 403 for non-admin
"""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ["EXPO_BACKEND_URL"].rstrip("/") if "EXPO_BACKEND_URL" in os.environ else \
           "https://padel-play-8.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN = {"email": "marc@padel.fr", "password": "password123"}
USER = {"email": "julie@padel.fr", "password": "password123"}


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def user_token():
    r = requests.post(f"{API}/auth/login", json=USER, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- /matches/open ----------
class TestOpenMatches:
    def test_open_matches_no_filter(self, admin_token):
        r = requests.get(f"{API}/matches/open", headers=h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0, "expected at least one open (seeded) match"
        first = data[0]
        # required extra fields
        assert "club_city" in first
        assert "club_region" in first
        assert "club_name" in first
        # not full, upcoming or undated
        assert first["is_full"] is False

    def test_open_matches_filter_level_confirme(self, admin_token):
        r = requests.get(f"{API}/matches/open", headers=h(admin_token),
                         params={"level": "Confirmé"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for m in data:
            assert m["author"]["level"] == "Confirmé", m

    def test_open_matches_filter_region(self, admin_token):
        # find any region available among matches
        base = requests.get(f"{API}/matches/open", headers=h(admin_token), timeout=15).json()
        regions = {m.get("club_region") for m in base if m.get("club_region")}
        if not regions:
            pytest.skip("No regions in current open matches")
        pick = next(iter(regions))
        r = requests.get(f"{API}/matches/open", headers=h(admin_token),
                         params={"region": pick}, timeout=15)
        assert r.status_code == 200
        for m in r.json():
            assert m["club_region"] == pick

    def test_open_matches_search(self, admin_token):
        r = requests.get(f"{API}/matches/open", headers=h(admin_token),
                         params={"search": "Toulouse"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for m in data:
            hay = f"{m.get('club_name','')} {m.get('club_city','')}".lower()
            assert "toulouse" in hay, m

    def test_open_matches_filter_date_excludes_undated(self, admin_token):
        # Create a match with a specific date to filter on
        clubs = requests.get(f"{API}/clubs", headers=h(admin_token), timeout=15).json()
        assert clubs
        club_id = clubs[0]["id"]
        # Use noon UTC 3 days out — Paris date will equal the UTC calendar date
        target_dt = (datetime.now(timezone.utc) + timedelta(days=3)).replace(
            hour=12, minute=0, second=0, microsecond=0
        )
        match_date = target_dt.isoformat()  # aware UTC
        r = requests.post(
            f"{API}/clubs/{club_id}/announcements",
            headers=h(admin_token),
            json={
                "content": f"TEST_iter15_dated_{uuid.uuid4().hex[:6]}",
                "match_date": match_date,
                "party_size": 1,
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # Query same day (naive noon → same UTC/Paris date at that hour)
        query_iso = target_dt.strftime("%Y-%m-%dT12:00:00")
        r2 = requests.get(f"{API}/matches/open", headers=h(admin_token),
                          params={"date": query_iso}, timeout=15)
        assert r2.status_code == 200
        data = r2.json()
        assert len(data) >= 1, "expected at least the announcement we just created"
        for m in data:
            assert m.get("match_date"), "undated should be excluded when date filter provided"


# ---------- /clubs/nearest ----------
class TestNearestClubs:
    def test_nearest_rennes_fallback(self, admin_token):
        r = requests.get(f"{API}/clubs/nearest", headers=h(admin_token),
                         params={"q": "Rennes"}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("city") is not None
        clubs = data.get("clubs") or []
        assert len(clubs) > 0, "expected fallback clubs when no Rennes match"
        # Sorted ascending
        distances = [c["distance_km"] for c in clubs]
        assert distances == sorted(distances)
        # First club should be Nantes-area (closest, ~100 km)
        first = clubs[0]
        assert first["distance_km"] < 200, first
        assert first.get("city") is not None

    def test_nearest_paris_ile_de_france_first(self, admin_token):
        r = requests.get(f"{API}/clubs/nearest", headers=h(admin_token),
                         params={"q": "Paris"}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        clubs = data.get("clubs") or []
        assert len(clubs) > 0
        # First club must be Île-de-France
        assert clubs[0]["region"] == "Île-de-France", clubs[0]


# ---------- /clubs PATCH admin + weather ----------
class TestAdminClubAndWeather:
    def _pick_outdoor_and_indoor(self, admin_token):
        clubs = requests.get(f"{API}/clubs", headers=h(admin_token), timeout=15).json()
        outdoor = next((c for c in clubs if c.get("is_outdoor")), None)
        indoor = next((c for c in clubs if not c.get("is_outdoor")), None)
        return outdoor, indoor, clubs

    def test_weather_outdoor_club(self, admin_token):
        outdoor, _, _ = self._pick_outdoor_and_indoor(admin_token)
        assert outdoor is not None, "expected at least one seeded outdoor club"
        r = requests.get(f"{API}/clubs/{outdoor['id']}/weather", headers=h(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("outdoor") is True
        assert isinstance(data.get("days"), list)  # may be empty on rate-limit; acceptable

    def test_weather_indoor_club(self, admin_token):
        _, indoor, _ = self._pick_outdoor_and_indoor(admin_token)
        assert indoor is not None
        r = requests.get(f"{API}/clubs/{indoor['id']}/weather", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data == {"outdoor": False, "days": []}

    def test_admin_toggle_outdoor_preserves_price(self, admin_token):
        # Set a price on a chosen club first, then toggle outdoor and verify price preserved
        clubs = requests.get(f"{API}/clubs", headers=h(admin_token), timeout=15).json()
        target = next(c for c in clubs if c["name"] == "4PADEL Lyon")
        cid = target["id"]
        # set price = 40
        r0 = requests.patch(f"{API}/clubs/{cid}", headers=h(admin_token),
                            json={"price_per_hour": 40}, timeout=15)
        assert r0.status_code == 200, r0.text
        assert r0.json().get("price_per_hour") == 40
        # toggle outdoor True
        r1 = requests.patch(f"{API}/clubs/{cid}", headers=h(admin_token),
                            json={"is_outdoor": True}, timeout=15)
        assert r1.status_code == 200, r1.text
        body = r1.json()
        assert body.get("is_outdoor") is True
        assert body.get("price_per_hour") == 40, "price must be preserved on outdoor toggle"
        # verify persisted via GET
        g = requests.get(f"{API}/clubs/{cid}", headers=h(admin_token), timeout=15).json()
        assert g["is_outdoor"] is True and g["price_per_hour"] == 40

    def test_admin_toggle_outdoor_false_preserves_price(self, admin_token):
        clubs = requests.get(f"{API}/clubs", headers=h(admin_token), timeout=15).json()
        target = next(c for c in clubs if c["name"] == "4PADEL Lyon")
        cid = target["id"]
        r1 = requests.patch(f"{API}/clubs/{cid}", headers=h(admin_token),
                            json={"is_outdoor": False}, timeout=15)
        assert r1.status_code == 200
        body = r1.json()
        assert body.get("is_outdoor") is False
        assert body.get("price_per_hour") == 40

    def test_admin_update_price_preserves_outdoor(self, admin_token):
        clubs = requests.get(f"{API}/clubs", headers=h(admin_token), timeout=15).json()
        # use Winners Padel (seeded outdoor True)
        target = next(c for c in clubs if c["name"] == "Winners Padel")
        cid = target["id"]
        prior_outdoor = target.get("is_outdoor")
        r = requests.patch(f"{API}/clubs/{cid}", headers=h(admin_token),
                           json={"price_per_hour": 40}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("price_per_hour") == 40
        assert body.get("is_outdoor") == prior_outdoor, "outdoor flag must not be touched"

    def test_non_admin_toggle_outdoor_403(self, user_token):
        clubs = requests.get(f"{API}/clubs", headers=h(user_token), timeout=15).json()
        cid = clubs[0]["id"]
        r = requests.patch(f"{API}/clubs/{cid}", headers=h(user_token),
                           json={"is_outdoor": True}, timeout=15)
        assert r.status_code == 403, r.text


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
