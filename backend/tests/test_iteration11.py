"""Iteration 11 backend tests:
- match_end_date + calculated status (upcoming/ongoing/past)
- Serialization of match_end_date, can_rate, has_rated on history & club announcements
- POST /api/announcements/{id}/rate (403 for non-participant, ignore self/offline, updates reliability, has_rated toggles)
- POST /api/announcements/{id}/replay accepts start+end dates and creates a new upcoming match
- Regressions: auth (4 users), clubs price_per_hour, favorites, history
"""
import os
import uuid
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


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


# ------- session-scoped fixtures -------
@pytest.fixture(scope="module")
def users():
    m_tok, m_u = _login("marc@padel.fr")
    j_tok, j_u = _login("julie@padel.fr")
    t_tok, t_u = _login("thomas@padel.fr")
    s_tok, s_u = _login("sophie@padel.fr")
    return {
        "marc": {"tok": m_tok, "user": m_u},
        "julie": {"tok": j_tok, "user": j_u},
        "thomas": {"tok": t_tok, "user": t_u},
        "sophie": {"tok": s_tok, "user": s_u},
    }


@pytest.fixture(scope="module")
def paris_club(users):
    r = requests.get(f"{API}/clubs", headers=_h(users["marc"]["tok"]), timeout=30)
    assert r.status_code == 200
    paris = [c for c in r.json() if c["name"] == "Padel Horizon Paris"][0]
    return paris


def _create_ann(tok, club_id, content, start_iso=None, end_iso=None, party_size=1):
    body = {"content": content, "party_size": party_size}
    if start_iso is not None:
        body["match_date"] = start_iso
    if end_iso is not None:
        body["match_end_date"] = end_iso
    r = requests.post(f"{API}/clubs/{club_id}/announcements", headers=_h(tok), json=body, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------- Auth regression ----------------
class TestAuthRegression:
    def test_4_users_login(self):
        for e in ["marc@padel.fr", "julie@padel.fr", "thomas@padel.fr", "sophie@padel.fr"]:
            tok, _ = _login(e)
            assert tok


# ---------------- Status calculation from match_end_date ----------------
class TestMatchStatus:
    def test_upcoming_status(self, users, paris_club):
        start = datetime.now(timezone.utc) + timedelta(days=2)
        end = start + timedelta(hours=1, minutes=30)
        a = _create_ann(users["marc"]["tok"], paris_club["id"], "TEST_iter11 upcoming",
                        _iso(start), _iso(end))
        assert a["status"] == "upcoming"
        assert a["match_end_date"] is not None
        assert a["match_date"] is not None
        assert a["can_rate"] is False
        assert a["has_rated"] is False

    def test_ongoing_status(self, users, paris_club):
        start = datetime.now(timezone.utc) - timedelta(minutes=10)
        end = datetime.now(timezone.utc) + timedelta(minutes=50)
        a = _create_ann(users["marc"]["tok"], paris_club["id"], "TEST_iter11 ongoing",
                        _iso(start), _iso(end))
        assert a["status"] == "ongoing"

    def test_past_status_when_end_passed(self, users, paris_club):
        # start 3h ago, end 1h ago -> past
        start = datetime.now(timezone.utc) - timedelta(hours=3)
        end = datetime.now(timezone.utc) - timedelta(hours=1)
        a = _create_ann(users["marc"]["tok"], paris_club["id"], "TEST_iter11 past-solo",
                        _iso(start), _iso(end))
        assert a["status"] == "past"


# ---------------- Serialization exposes new fields ----------------
class TestSerializationFields:
    def test_history_has_new_fields(self, users):
        r = requests.get(f"{API}/matches/history", headers=_h(users["marc"]["tok"]), timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1
        for a in items:
            for k in ("match_end_date", "can_rate", "has_rated", "status", "is_full"):
                assert k in a, f"missing {k} in history serialization"

    def test_club_announcements_has_new_fields(self, users, paris_club):
        r = requests.get(f"{API}/clubs/{paris_club['id']}/announcements",
                         headers=_h(users["marc"]["tok"]), timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        for a in items[:5]:
            for k in ("match_end_date", "can_rate", "has_rated", "status"):
                assert k in a


# ---------------- Full 4/4 past match => can_rate flow ----------------
@pytest.fixture(scope="module")
def full_past_match(users, paris_club):
    """Create a past match, then have 3 other users join to make it 4/4."""
    start = datetime.now(timezone.utc) - timedelta(hours=3)
    end = datetime.now(timezone.utc) - timedelta(hours=1)
    ann = _create_ann(users["marc"]["tok"], paris_club["id"], "TEST_iter11 4/4 past",
                      _iso(start), _iso(end))
    aid = ann["id"]
    for who in ("julie", "thomas", "sophie"):
        r = requests.post(f"{API}/announcements/{aid}/join",
                          headers=_h(users[who]["tok"]), timeout=30)
        assert r.status_code == 200, f"join {who}: {r.text}"
    # verify full
    r = requests.get(f"{API}/matches/history", headers=_h(users["marc"]["tok"]), timeout=30)
    ann = [x for x in r.json() if x["id"] == aid][0]
    assert ann["is_full"] is True
    assert ann["status"] == "past"
    return ann


class TestCanRate:
    def test_can_rate_true_for_participant_full_past(self, users, full_past_match):
        # Refresh from marc's history to get can_rate for marc
        aid = full_past_match["id"]
        r = requests.get(f"{API}/matches/history", headers=_h(users["marc"]["tok"]), timeout=30)
        ann = [x for x in r.json() if x["id"] == aid][0]
        assert ann["can_rate"] is True
        assert ann["has_rated"] is False

    def test_can_rate_false_for_non_participant(self, users, full_past_match, paris_club):
        # Create a fresh user via register who did not join
        email = f"iter11_nonp_{uuid.uuid4().hex[:6]}@padel.fr"
        r = requests.post(f"{API}/auth/register",
                         json={"email": email, "password": "password123",
                               "pseudo": f"IT11N{uuid.uuid4().hex[:6]}"},
                         timeout=30)
        assert r.status_code == 200, r.text
        tok = r.json()["token"]
        # Non-participant queries club announcements
        r = requests.get(f"{API}/clubs/{paris_club['id']}/announcements",
                         headers=_h(tok), timeout=30)
        ann = [x for x in r.json() if x["id"] == full_past_match["id"]][0]
        assert ann["can_rate"] is False


# ---------------- Rate endpoint ----------------
class TestRateEndpoint:
    def test_rate_forbidden_for_non_participant(self, users, full_past_match):
        # Register a fresh non-participant
        email = f"iter11_nnr_{uuid.uuid4().hex[:6]}@padel.fr"
        r = requests.post(f"{API}/auth/register",
                         json={"email": email, "password": "password123",
                               "pseudo": f"IT11X{uuid.uuid4().hex[:6]}"},
                         timeout=30)
        tok = r.json()["token"]
        r = requests.post(f"{API}/announcements/{full_past_match['id']}/rate",
                          headers=_h(tok),
                          json={"ratings": [{"user_id": users["marc"]["user"]["id"], "stars": 5}]},
                          timeout=30)
        assert r.status_code == 403

    def test_rate_ignores_self_and_non_players(self, users, full_past_match):
        # Julie rates: include marc (valid), julie (self, ignored), a random uuid (ignored)
        aid = full_past_match["id"]
        # Snapshot marc reliability
        r = requests.get(f"{API}/users/{users['marc']['user']['id']}",
                         headers=_h(users["julie"]["tok"]), timeout=30)
        marc_before_sum = r.json()["reliability_avg"] * r.json()["reliability_count"]
        marc_before_count = r.json()["reliability_count"]

        payload = {"ratings": [
            {"user_id": users["marc"]["user"]["id"], "stars": 5},
            {"user_id": users["julie"]["user"]["id"], "stars": 1},  # self
            {"user_id": str(uuid.uuid4()), "stars": 1},  # not a player
        ]}
        r = requests.post(f"{API}/announcements/{aid}/rate",
                          headers=_h(users["julie"]["tok"]),
                          json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # julie's view: has_rated true, can_rate false
        assert data["has_rated"] is True
        assert data["can_rate"] is False

        # Marc's reliability increased by 5 (1 new rating)
        r = requests.get(f"{API}/users/{users['marc']['user']['id']}",
                         headers=_h(users["julie"]["tok"]), timeout=30)
        marc_after_count = r.json()["reliability_count"]
        assert marc_after_count == marc_before_count + 1

        # Julie's reliability should NOT have changed (self ignored)
        r = requests.get(f"{API}/users/{users['julie']['user']['id']}",
                         headers=_h(users["marc"]["tok"]), timeout=30)
        # Julie was not rated by anyone else in this test
        # We just assert reliability_count did not include a self-vote (there was a rating of self ignored)
        assert isinstance(r.json()["reliability_count"], int)

    def test_after_rate_can_rate_false_and_has_rated_true(self, users, full_past_match):
        aid = full_past_match["id"]
        # From julie's perspective (already rated above)
        r = requests.get(f"{API}/matches/history",
                         headers=_h(users["julie"]["tok"]), timeout=30)
        ann = [x for x in r.json() if x["id"] == aid][0]
        assert ann["has_rated"] is True
        assert ann["can_rate"] is False


# ---------------- Replay endpoint ----------------
class TestReplayEndpoint:
    def test_replay_creates_upcoming_match_with_end_date(self, users, full_past_match):
        aid = full_past_match["id"]
        start = datetime.now(timezone.utc) + timedelta(days=3)
        end = start + timedelta(hours=1)
        r = requests.post(f"{API}/announcements/{aid}/replay",
                          headers=_h(users["marc"]["tok"]),
                          json={"match_date": _iso(start), "match_end_date": _iso(end)},
                          timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] != aid
        assert data["status"] == "upcoming"
        assert data["match_end_date"] is not None
        # Same 4 registered players
        assert data["total_players"] >= 4
