"""Iteration 9 backend tests: match_date+status, replay, favorites, route ordering."""
import os
from datetime import datetime, timedelta, timezone
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


def _first_club(tok):
    r = requests.get(f"{API}/clubs", headers=_h(tok), timeout=30)
    assert r.status_code == 200
    return r.json()[0]


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


@pytest.fixture(scope="module")
def marc():
    tok, u = _login("marc@padel.fr")
    return {"tok": tok, "user": u}


@pytest.fixture(scope="module")
def julie():
    tok, u = _login("julie@padel.fr")
    return {"tok": tok, "user": u}


@pytest.fixture(scope="module")
def kevin():
    tok, u = _login("kevin@padel.fr")
    return {"tok": tok, "user": u}


# --------- Match date + status ---------
class TestMatchDateStatus:
    def test_upcoming(self, marc):
        club = _first_club(marc["tok"])
        future = _iso(datetime.now(timezone.utc) + timedelta(days=2))
        r = requests.post(f"{API}/clubs/{club['id']}/announcements", headers=_h(marc["tok"]),
                          json={"content": "TEST_iter9 upcoming", "match_date": future}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["match_date"] == future
        assert data["status"] == "upcoming"

    def test_past(self, marc):
        club = _first_club(marc["tok"])
        past = _iso(datetime.now(timezone.utc) - timedelta(hours=5))
        r = requests.post(f"{API}/clubs/{club['id']}/announcements", headers=_h(marc["tok"]),
                          json={"content": "TEST_iter9 past", "match_date": past}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "past"

    def test_ongoing(self, marc):
        club = _first_club(marc["tok"])
        # 30 min ago -> within 2h window -> ongoing
        ongoing = _iso(datetime.now(timezone.utc) - timedelta(minutes=30))
        r = requests.post(f"{API}/clubs/{club['id']}/announcements", headers=_h(marc["tok"]),
                          json={"content": "TEST_iter9 ongoing", "match_date": ongoing}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "ongoing"

    def test_undated(self, marc):
        club = _first_club(marc["tok"])
        r = requests.post(f"{API}/clubs/{club['id']}/announcements", headers=_h(marc["tok"]),
                          json={"content": "TEST_iter9 undated"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "undated"
        assert data["match_date"] is None

    def test_status_in_list_and_history(self, marc):
        club = _first_club(marc["tok"])
        future = _iso(datetime.now(timezone.utc) + timedelta(days=3))
        r = requests.post(f"{API}/clubs/{club['id']}/announcements", headers=_h(marc["tok"]),
                          json={"content": "TEST_iter9 list-serialize", "match_date": future}, timeout=30)
        assert r.status_code == 200
        ann_id = r.json()["id"]

        r = requests.get(f"{API}/clubs/{club['id']}/announcements", headers=_h(marc["tok"]), timeout=30)
        assert r.status_code == 200
        found = [a for a in r.json() if a["id"] == ann_id]
        assert found and found[0]["status"] == "upcoming"
        assert found[0]["match_date"] == future

        r = requests.get(f"{API}/matches/history", headers=_h(marc["tok"]), timeout=30)
        assert r.status_code == 200
        found = [a for a in r.json() if a["id"] == ann_id]
        assert found and found[0]["status"] == "upcoming"


# --------- Replay ---------
class TestReplay:
    def test_replay_creates_new_match_with_same_players_and_sends_dm(self, marc, julie):
        club = _first_club(marc["tok"])
        # create source match with named offline + author
        past = _iso(datetime.now(timezone.utc) - timedelta(days=1))
        r = requests.post(f"{API}/clubs/{club['id']}/announcements", headers=_h(marc["tok"]),
                          json={"content": "TEST_iter9 replay-src", "match_date": past,
                                "offline_names": ["Paul", "Sarah"]}, timeout=30)
        assert r.status_code == 200
        src = r.json()
        src_id = src["id"]

        # julie joins to become co-player
        r = requests.post(f"{API}/announcements/{src_id}/join", headers=_h(julie["tok"]), timeout=30)
        assert r.status_code == 200
        assert r.json()["total_players"] == 4

        # baseline unread count for julie
        r = requests.get(f"{API}/messages/unread_count", headers=_h(julie["tok"]), timeout=30)
        assert r.status_code == 200
        before = r.json()["count"]

        # replay
        new_date = _iso(datetime.now(timezone.utc) + timedelta(days=4))
        r = requests.post(f"{API}/announcements/{src_id}/replay", headers=_h(marc["tok"]),
                          json={"match_date": new_date}, timeout=30)
        assert r.status_code == 200, r.text
        new = r.json()
        assert new["id"] != src_id
        assert new["club_id"] == src["club_id"]
        assert new["match_date"] == new_date
        assert new["status"] == "upcoming"
        # same registered players (marc + julie)
        new_player_ids = sorted([p["id"] for p in new["players"]])
        expected = sorted([marc["user"]["id"], julie["user"]["id"]])
        assert new_player_ids == expected
        # offline names copied
        assert new["offline_players"] == ["Paul", "Sarah"]
        # invite content present
        assert isinstance(new["content"], str) and len(new["content"]) > 0

        # julie should have received a private message
        r = requests.get(f"{API}/messages/unread_count", headers=_h(julie["tok"]), timeout=30)
        assert r.status_code == 200
        after = r.json()["count"]
        assert after >= before + 1, f"unread should increase (before={before} after={after})"

        r = requests.get(f"{API}/messages/{marc['user']['id']}", headers=_h(julie["tok"]), timeout=30)
        assert r.status_code == 200
        msgs = r.json()
        assert any(m["from_user_id"] == marc["user"]["id"] and "rejouer" in m["content"].lower() for m in msgs)

    def test_replay_without_coplayers_still_works(self, marc):
        club = _first_club(marc["tok"])
        r = requests.post(f"{API}/clubs/{club['id']}/announcements", headers=_h(marc["tok"]),
                          json={"content": "TEST_iter9 solo-src"}, timeout=30)
        assert r.status_code == 200
        src_id = r.json()["id"]
        r = requests.post(f"{API}/announcements/{src_id}/replay", headers=_h(marc["tok"]),
                          json={"match_date": None}, timeout=30)
        assert r.status_code == 200
        assert r.json()["status"] == "undated"

    def test_replay_404_on_unknown(self, marc):
        r = requests.post(f"{API}/announcements/does-not-exist/replay", headers=_h(marc["tok"]),
                          json={"match_date": None}, timeout=30)
        assert r.status_code == 404


# --------- Favorites ---------
class TestFavorites:
    def test_toggle_add_and_remove(self, marc, julie):
        # ensure clean baseline: force remove first via toggle if already fav
        r = requests.get(f"{API}/users/{julie['user']['id']}", headers=_h(marc["tok"]), timeout=30)
        assert r.status_code == 200
        if r.json().get("is_favorite"):
            requests.post(f"{API}/users/{julie['user']['id']}/favorite", headers=_h(marc["tok"]), timeout=30)

        # add
        r = requests.post(f"{API}/users/{julie['user']['id']}/favorite", headers=_h(marc["tok"]), timeout=30)
        assert r.status_code == 200, r.text
        assert r.json() == {"is_favorite": True}

        # get_user should reflect it for viewer=marc
        r = requests.get(f"{API}/users/{julie['user']['id']}", headers=_h(marc["tok"]), timeout=30)
        assert r.json()["is_favorite"] is True

        # list favorites includes julie
        r = requests.get(f"{API}/users/favorites", headers=_h(marc["tok"]), timeout=30)
        assert r.status_code == 200, r.text
        favs = r.json()
        assert isinstance(favs, list)
        ids = [u["id"] for u in favs]
        assert julie["user"]["id"] in ids
        # enriched shape
        me = [u for u in favs if u["id"] == julie["user"]["id"]][0]
        assert me["is_favorite"] is True
        assert me["pseudo"]

        # remove
        r = requests.post(f"{API}/users/{julie['user']['id']}/favorite", headers=_h(marc["tok"]), timeout=30)
        assert r.status_code == 200
        assert r.json() == {"is_favorite": False}

        r = requests.get(f"{API}/users/favorites", headers=_h(marc["tok"]), timeout=30)
        assert julie["user"]["id"] not in [u["id"] for u in r.json()]

    def test_cannot_favorite_self(self, marc):
        r = requests.post(f"{API}/users/{marc['user']['id']}/favorite", headers=_h(marc["tok"]), timeout=30)
        assert r.status_code == 400

    def test_route_order_favorites_before_userid(self, marc):
        # Ensure /users/favorites is not caught by /users/{id} (would 404 as 'favorites' is not a valid id)
        r = requests.get(f"{API}/users/favorites", headers=_h(marc["tok"]), timeout=30)
        assert r.status_code == 200
        # response must be a list (favorites endpoint), not a user object
        assert isinstance(r.json(), list)

    def test_is_favorite_viewer_specific(self, marc, julie, kevin):
        # marc favorites kevin -> marc sees is_favorite True, julie sees False
        # cleanup baseline
        r = requests.get(f"{API}/users/{kevin['user']['id']}", headers=_h(marc["tok"]), timeout=30)
        if r.json().get("is_favorite"):
            requests.post(f"{API}/users/{kevin['user']['id']}/favorite", headers=_h(marc["tok"]), timeout=30)
        # marc adds kevin
        requests.post(f"{API}/users/{kevin['user']['id']}/favorite", headers=_h(marc["tok"]), timeout=30)
        r_m = requests.get(f"{API}/users/{kevin['user']['id']}", headers=_h(marc["tok"]), timeout=30).json()
        r_j = requests.get(f"{API}/users/{kevin['user']['id']}", headers=_h(julie["tok"]), timeout=30).json()
        assert r_m["is_favorite"] is True
        assert r_j["is_favorite"] is False
        # cleanup
        requests.post(f"{API}/users/{kevin['user']['id']}/favorite", headers=_h(marc["tok"]), timeout=30)

    def test_favorite_404_unknown_user(self, marc):
        r = requests.post(f"{API}/users/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/favorite", headers=_h(marc["tok"]), timeout=30)
        assert r.status_code == 404


# --------- Regression ---------
class TestRegression:
    def test_join_leave_still_works(self, marc, julie):
        club = _first_club(marc["tok"])
        r = requests.post(f"{API}/clubs/{club['id']}/announcements", headers=_h(marc["tok"]),
                          json={"content": "TEST_iter9 reg-join"}, timeout=30)
        ann_id = r.json()["id"]
        r = requests.post(f"{API}/announcements/{ann_id}/join", headers=_h(julie["tok"]), timeout=30)
        assert r.status_code == 200
        assert r.json()["total_players"] == 2
        r = requests.post(f"{API}/announcements/{ann_id}/leave", headers=_h(julie["tok"]), timeout=30)
        assert r.status_code == 200

    def test_list_announcements_shape(self, marc):
        club = _first_club(marc["tok"])
        r = requests.get(f"{API}/clubs/{club['id']}/announcements", headers=_h(marc["tok"]), timeout=30)
        assert r.status_code == 200
        for a in r.json():
            for k in ("match_date", "status", "offline_players", "total_players", "slots_left", "max_players"):
                assert k in a
            assert a["max_players"] == 4

    def test_auth_required_replay_favorites(self):
        r = requests.post(f"{API}/announcements/anything/replay", json={}, timeout=30)
        assert r.status_code == 401
        r = requests.get(f"{API}/users/favorites", timeout=30)
        assert r.status_code == 401
