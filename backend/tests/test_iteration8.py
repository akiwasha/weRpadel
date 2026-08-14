"""Iteration 8 backend tests: offline_names, /matches/history, join cap with offline players."""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password="password123"):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _first_club(tok):
    r = requests.get(f"{API}/clubs", headers=_h(tok), timeout=30)
    assert r.status_code == 200
    return r.json()[0]


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


# ---------------- offline_names creation ----------------
class TestOfflineNames:
    def test_create_with_named_offline_players(self, marc):
        club = _first_club(marc["tok"])
        payload = {
            "content": "TEST_iter8 offline names Paul+Sarah",
            "availability": "Samedi 14h",
            "offline_names": ["Paul", "Sarah"],
        }
        r = requests.post(f"{API}/clubs/{club['id']}/announcements", headers=_h(marc["tok"]), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["offline_players"] == ["Paul", "Sarah"]
        assert data["total_players"] == 3
        assert data["slots_left"] == 1
        assert data["is_full"] is False
        assert data["club_name"] == club["name"]
        assert data["is_author"] is True
        assert len(data["players"]) == 1
        return data["id"]

    def test_offline_names_trim_and_ignore_empty(self, marc):
        club = _first_club(marc["tok"])
        payload = {
            "content": "TEST_iter8 trim",
            "offline_names": ["  Léa  ", "", "   ", "Max"],
        }
        r = requests.post(f"{API}/clubs/{club['id']}/announcements", headers=_h(marc["tok"]), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["offline_players"] == ["Léa", "Max"]
        assert data["total_players"] == 3

    def test_offline_names_capped_at_3(self, marc):
        club = _first_club(marc["tok"])
        payload = {
            "content": "TEST_iter8 cap",
            "offline_names": ["A", "B", "C", "D", "E"],
        }
        r = requests.post(f"{API}/clubs/{club['id']}/announcements", headers=_h(marc["tok"]), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data["offline_players"]) == 3
        assert data["is_full"] is True
        assert data["slots_left"] == 0

    def test_backcompat_party_size_without_offline_names(self, marc):
        club = _first_club(marc["tok"])
        payload = {"content": "TEST_iter8 backcompat", "party_size": 3}
        r = requests.post(f"{API}/clubs/{club['id']}/announcements", headers=_h(marc["tok"]), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # party_size=3 -> 2 offline unnamed slots
        assert data["offline_players"] == ["", ""]
        assert data["total_players"] == 3
        assert data["slots_left"] == 1

    def test_default_no_offline(self, marc):
        club = _first_club(marc["tok"])
        r = requests.post(f"{API}/clubs/{club['id']}/announcements", headers=_h(marc["tok"]), json={"content": "TEST_iter8 solo"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["offline_players"] == []
        assert data["total_players"] == 1
        assert data["slots_left"] == 3


# ---------------- join cap ----------------
class TestJoinCap:
    def test_join_respects_offline_names_cap(self, marc, julie, kevin):
        club = _first_club(marc["tok"])
        # 2 offline => 1 slot left
        r = requests.post(f"{API}/clubs/{club['id']}/announcements", headers=_h(marc["tok"]),
                          json={"content": "TEST_iter8 join cap", "offline_names": ["Paul", "Sarah"]}, timeout=30)
        assert r.status_code == 200
        ann_id = r.json()["id"]
        # julie joins -> full
        r = requests.post(f"{API}/announcements/{ann_id}/join", headers=_h(julie["tok"]), timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["is_full"] is True
        assert r.json()["total_players"] == 4
        # kevin tries -> 409
        r = requests.post(f"{API}/announcements/{ann_id}/join", headers=_h(kevin["tok"]), timeout=30)
        assert r.status_code == 409
        # cleanup: julie leaves
        requests.post(f"{API}/announcements/{ann_id}/leave", headers=_h(julie["tok"]), timeout=30)


# ---------------- matches history ----------------
class TestMatchesHistory:
    def test_history_returns_author_matches(self, marc):
        club = _first_club(marc["tok"])
        # create fresh match
        r = requests.post(f"{API}/clubs/{club['id']}/announcements", headers=_h(marc["tok"]),
                          json={"content": "TEST_iter8 hist auth", "offline_names": ["Paul", "Sarah"]}, timeout=30)
        assert r.status_code == 200
        ann_id = r.json()["id"]

        r = requests.get(f"{API}/matches/history", headers=_h(marc["tok"]), timeout=30)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list) and len(items) >= 1
        ids = [it["id"] for it in items]
        assert ann_id in ids
        # sorted desc by created_at
        dates = [it["created_at"] for it in items]
        assert dates == sorted(dates, reverse=True)
        # shape check
        first = items[0]
        for k in ("club_name", "players", "offline_players", "total_players", "is_full"):
            assert k in first

    def test_history_returns_joined_matches(self, marc, julie):
        club = _first_club(marc["tok"])
        r = requests.post(f"{API}/clubs/{club['id']}/announcements", headers=_h(marc["tok"]),
                          json={"content": "TEST_iter8 hist joined"}, timeout=30)
        assert r.status_code == 200
        ann_id = r.json()["id"]
        # julie joins
        r = requests.post(f"{API}/announcements/{ann_id}/join", headers=_h(julie["tok"]), timeout=30)
        assert r.status_code == 200
        # julie should see it in her history
        r = requests.get(f"{API}/matches/history", headers=_h(julie["tok"]), timeout=30)
        assert r.status_code == 200
        ids = [it["id"] for it in r.json()]
        assert ann_id in ids
        # cleanup
        requests.post(f"{API}/announcements/{ann_id}/leave", headers=_h(julie["tok"]), timeout=30)

    def test_history_auth_required(self):
        r = requests.get(f"{API}/matches/history", timeout=30)
        assert r.status_code == 401


# ---------------- regression: leave/join, list ----------------
class TestRegression:
    def test_list_announcements_still_works(self, marc):
        club = _first_club(marc["tok"])
        r = requests.get(f"{API}/clubs/{club['id']}/announcements", headers=_h(marc["tok"]), timeout=30)
        assert r.status_code == 200
        for a in r.json():
            assert "offline_players" in a
            assert "total_players" in a
            assert "slots_left" in a
            assert a["max_players"] == 4
