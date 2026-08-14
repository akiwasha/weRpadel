"""
Iteration 16 backend tests (weRpadel):
- PUT /api/auth/me accepts preferred_region and returns it via GET /auth/me; ''  => null
- GET /api/matches/open items include club_is_outdoor (bool)
- GET /api/matches/open?sort=distance : with city, items have distance_km and are asc; without city, falls back to date sort (no error)
- POST /api/clubs/{id}/announcements always 200 even if push alert fails; announcement is created
- New-match alert: user B with preferred_region == club.region AND level == organizer.level triggers a (non-blocking) push. Just verify creation succeeds
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ["EXPO_BACKEND_URL"].rstrip("/")
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


# ---------- Preferred region ----------
class TestPreferredRegion:
    def test_set_preferred_region_and_readback(self, user_token):
        # set to Occitanie
        r = requests.put(f"{API}/auth/me", headers=h(user_token),
                         json={"preferred_region": "Occitanie"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("preferred_region") == "Occitanie"

        # /auth/me returns it
        r2 = requests.get(f"{API}/auth/me", headers=h(user_token), timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("preferred_region") == "Occitanie"

    def test_clear_preferred_region_with_empty_string(self, user_token):
        r = requests.put(f"{API}/auth/me", headers=h(user_token),
                         json={"preferred_region": ""}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("preferred_region") in (None, "")
        # readback should confirm null
        r2 = requests.get(f"{API}/auth/me", headers=h(user_token), timeout=15)
        assert r2.json().get("preferred_region") in (None, "")


# ---------- club_is_outdoor field ----------
class TestOpenMatchesOutdoorField:
    def test_open_matches_include_club_is_outdoor(self, admin_token):
        r = requests.get(f"{API}/matches/open", headers=h(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        for item in data:
            assert "club_is_outdoor" in item, f"missing club_is_outdoor in {item.get('id')}"
            assert isinstance(item["club_is_outdoor"], bool), \
                f"club_is_outdoor should be bool, got {type(item['club_is_outdoor'])}"


# ---------- Distance sorting ----------
class TestDistanceSort:
    def test_sort_distance_with_city(self, user_token):
        # ensure julie has city Lyon
        r0 = requests.put(f"{API}/auth/me", headers=h(user_token),
                          json={"city": "Lyon"}, timeout=15)
        assert r0.status_code == 200, r0.text
        assert r0.json().get("city") == "Lyon"

        r = requests.get(f"{API}/matches/open", headers=h(user_token),
                         params={"sort": "distance"}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        # every item should have distance_km (possibly None if club lat/lon missing)
        for item in data:
            assert "distance_km" in item, f"missing distance_km in {item.get('id')}"
        # extract non-None distances and check they are non-decreasing
        distances = [it["distance_km"] for it in data if it.get("distance_km") is not None]
        assert len(distances) >= 2, "expected multiple items with a distance"
        assert distances == sorted(distances), \
            f"distance_km should be ascending, got {distances}"

    def test_sort_distance_without_city_no_error(self, admin_token):
        # marc: clear his city
        r0 = requests.put(f"{API}/auth/me", headers=h(admin_token),
                          json={"city": ""}, timeout=15)
        assert r0.status_code == 200, r0.text

        r = requests.get(f"{API}/matches/open", headers=h(admin_token),
                         params={"sort": "distance"}, timeout=20)
        # should not raise a 500; falls back to date sort
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list) and len(data) > 0


# ---------- Announcement creation with push alert (non-blocking) ----------
class TestAnnouncementPushAlert:
    def test_create_announcement_returns_200_even_if_push_fails(self, admin_token, user_token):
        # Get marc's level + a club in a specific region
        me = requests.get(f"{API}/auth/me", headers=h(admin_token), timeout=15).json()
        organizer_level = me.get("level")
        assert organizer_level, "marc must have a level"

        clubs = requests.get(f"{API}/clubs", headers=h(admin_token), timeout=15).json()
        assert isinstance(clubs, list) and len(clubs) > 0
        # pick first approved (all seeded are approved). Prefer one with a region.
        club = next((c for c in clubs if c.get("region")), clubs[0])
        club_id = club["id"]
        club_region = club.get("region")

        # Set julie: preferred_region = club_region AND level = organizer level
        # (test A: matched recipient -> push attempted (placeholder key -> fails silently))
        r_lvl = requests.put(f"{API}/auth/me", headers=h(user_token),
                             json={"level": organizer_level, "preferred_region": club_region}, timeout=15)
        assert r_lvl.status_code == 200, r_lvl.text

        # Create announcement as marc on that club
        tag = f"TEST_iter16_{uuid.uuid4().hex[:6]}"
        body = {
            "content": tag,
            "availability": "matin",
            "party_size": 1,
        }
        r = requests.post(f"{API}/clubs/{club_id}/announcements",
                          headers=h(admin_token), json=body, timeout=25)
        assert r.status_code == 200, f"expected 200 even if push fails, got {r.status_code}: {r.text}"
        created = r.json()
        assert created.get("content") == tag
        ann_id = created.get("id")
        assert ann_id

        # Verify announcement exists by listing
        r_list = requests.get(f"{API}/clubs/{club_id}/announcements",
                              headers=h(admin_token), timeout=15)
        assert r_list.status_code == 200
        ids = [a.get("id") for a in r_list.json()]
        assert ann_id in ids, "created announcement should be listed"

        # ---- cleanup ----
        try:
            requests.post(f"{API}/announcements/{ann_id}/leave",
                          headers=h(admin_token), timeout=10)
        except Exception:
            pass
        # Delete via admin endpoint if available; otherwise leave the tagged TEST_ item
        try:
            requests.delete(f"{API}/announcements/{ann_id}",
                            headers=h(admin_token), timeout=10)
        except Exception:
            pass

    def test_create_announcement_no_matching_recipient_still_200(self, admin_token, user_token):
        # Set julie to a mismatching preferred_region (unlikely)
        requests.put(f"{API}/auth/me", headers=h(user_token),
                     json={"preferred_region": "ZZZ_NoSuchRegion"}, timeout=15)

        clubs = requests.get(f"{API}/clubs", headers=h(admin_token), timeout=15).json()
        club = next((c for c in clubs if c.get("region")), clubs[0])
        club_id = club["id"]

        tag = f"TEST_iter16_norec_{uuid.uuid4().hex[:6]}"
        body = {"content": tag, "availability": "soir", "party_size": 1}
        r = requests.post(f"{API}/clubs/{club_id}/announcements",
                          headers=h(admin_token), json=body, timeout=20)
        assert r.status_code == 200, r.text
        ann_id = r.json().get("id")
        # cleanup
        try:
            requests.delete(f"{API}/announcements/{ann_id}", headers=h(admin_token), timeout=10)
        except Exception:
            pass


# ---------- cleanup: reset julie's preferred_region to None at end ----------
@pytest.fixture(scope="module", autouse=True)
def _cleanup(user_token, admin_token):
    yield
    try:
        requests.put(f"{API}/auth/me", headers=h(user_token),
                     json={"preferred_region": ""}, timeout=10)
    except Exception:
        pass
