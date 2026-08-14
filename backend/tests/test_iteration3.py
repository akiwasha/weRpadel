"""Iteration 3 tests: unread_count endpoint, verified field, club lat/lng, route order, regression."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or "https://padel-play-8.preview.emergentagent.com"
API = f"{BASE_URL}/api"


def _login(email, password="password123"):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Feature 1: unread_count ----------
class TestUnreadCount:
    def test_unread_count_flow_marc_receives_from_julie(self):
        marc_tok, marc = _login("marc@padel.fr")
        julie_tok, julie = _login("julie@padel.fr")

        # baseline for Marc: read all existing DMs from julie by opening conv
        requests.get(f"{API}/messages/{julie['id']}", headers=_auth(marc_tok), timeout=30)
        base = requests.get(f"{API}/messages/unread_count", headers=_auth(marc_tok), timeout=30)
        assert base.status_code == 200
        base_count = base.json()["count"]
        assert isinstance(base_count, int)

        # Julie sends a DM to Marc
        content = f"TEST_iter3_unread_{uuid.uuid4().hex[:8]}"
        s = requests.post(f"{API}/messages", json={"to_user_id": marc["id"], "content": content},
                          headers=_auth(julie_tok), timeout=30)
        assert s.status_code == 200, s.text

        # unread count for Marc should have incremented by exactly 1
        c1 = requests.get(f"{API}/messages/unread_count", headers=_auth(marc_tok), timeout=30)
        assert c1.status_code == 200
        assert c1.json()["count"] == base_count + 1

        # Marc opens the conversation → messages marked as read
        conv = requests.get(f"{API}/messages/{julie['id']}", headers=_auth(marc_tok), timeout=30)
        assert conv.status_code == 200
        # our new message should be in there and now read (server marks-then-returns; may still show read=false in returned rows depending on impl)
        assert any(m["content"] == content for m in conv.json())

        # unread should be 0 (or at least back to base minus any older unread — but since we baselined by opening, base_count == 0)
        c2 = requests.get(f"{API}/messages/unread_count", headers=_auth(marc_tok), timeout=30)
        assert c2.status_code == 200
        assert c2.json()["count"] == 0

    def test_unread_count_requires_auth(self):
        r = requests.get(f"{API}/messages/unread_count", timeout=30)
        assert r.status_code == 401


# ---------- Feature 2: route order (unread_count NOT captured as {other_id}) ----------
class TestRouteOrder:
    def test_unread_count_not_treated_as_other_id(self):
        marc_tok, _ = _login("marc@padel.fr")
        r = requests.get(f"{API}/messages/unread_count", headers=_auth(marc_tok), timeout=30)
        assert r.status_code == 200
        body = r.json()
        # If it were captured as {other_id}, we'd get a list (conversation) not an object with count
        assert isinstance(body, dict) and "count" in body


# ---------- Feature 3: verified field across endpoints ----------
class TestVerifiedField:
    def test_kevin_is_verified(self):
        # login kevin, /auth/me
        kev_tok, kev = _login("kevin@padel.fr")
        assert "verified" in kev
        assert kev["verified"] is True, f"Kevin should be verified, got {kev}"
        assert kev["reliability_avg"] >= 4.5
        assert kev["reliability_count"] >= 5

    def test_marc_is_not_verified(self):
        marc_tok, marc = _login("marc@padel.fr")
        assert "verified" in marc
        assert marc["verified"] is False, f"Marc should NOT be verified, got {marc}"

    def test_verified_in_get_user(self):
        marc_tok, _ = _login("marc@padel.fr")
        kev_tok, kev = _login("kevin@padel.fr")
        r = requests.get(f"{API}/users/{kev['id']}", headers=_auth(marc_tok), timeout=30)
        assert r.status_code == 200
        assert r.json()["verified"] is True

    def test_verified_in_announcement_authors(self):
        marc_tok, _ = _login("marc@padel.fr")
        clubs = requests.get(f"{API}/clubs", headers=_auth(marc_tok), timeout=30).json()
        found_verified_field = False
        for c in clubs[:6]:
            anns = requests.get(f"{API}/clubs/{c['id']}/announcements", headers=_auth(marc_tok), timeout=30).json()
            for a in anns:
                assert "verified" in a["author"], f"author missing verified: {a['author']}"
                found_verified_field = True
        assert found_verified_field, "No announcements found to verify author.verified"

    def test_verified_in_conversations(self):
        marc_tok, marc = _login("marc@padel.fr")
        julie_tok, julie = _login("julie@padel.fr")
        # ensure at least one conv exists
        requests.post(f"{API}/messages", json={"to_user_id": marc["id"], "content": "TEST_iter3_conv_ping"},
                      headers=_auth(julie_tok), timeout=30)
        convs = requests.get(f"{API}/messages/conversations", headers=_auth(marc_tok), timeout=30)
        assert convs.status_code == 200
        data = convs.json()
        assert len(data) > 0
        for c in data:
            assert "verified" in c["other_user"]

    def test_rate_updates_verified_when_threshold_reached(self):
        # Create a fresh throwaway user and have another fresh user rate them 5 times
        suffix = uuid.uuid4().hex[:8]
        target_email = f"TEST_target_{suffix}@padel.fr"
        target_reg = requests.post(f"{API}/auth/register", json={
            "email": target_email, "password": "password123", "pseudo": f"TESTtgt{suffix}"}, timeout=30)
        assert target_reg.status_code == 200
        target = target_reg.json()["user"]
        assert target["verified"] is False

        # need 5 different raters — use demo users
        raters = ["marc@padel.fr", "julie@padel.fr", "thomas@padel.fr", "sophie@padel.fr", "kevin@padel.fr"]
        for em in raters:
            tok, _ = _login(em)
            r = requests.post(f"{API}/users/{target['id']}/rate", json={"stars": 5},
                              headers=_auth(tok), timeout=30)
            assert r.status_code == 200, r.text

        # last response should already have verified True
        assert r.json()["verified"] is True
        assert r.json()["reliability_count"] == 5
        assert r.json()["reliability_avg"] >= 4.5


# ---------- Feature 4: clubs latitude/longitude ----------
class TestClubsGeo:
    def test_all_clubs_have_lat_lng(self):
        marc_tok, _ = _login("marc@padel.fr")
        clubs = requests.get(f"{API}/clubs", headers=_auth(marc_tok), timeout=30).json()
        seeded = [c for c in clubs if c.get("approved", True)]
        assert len(seeded) >= 12, f"expected 12+ approved clubs, got {len(seeded)}"
        for c in seeded:
            assert c.get("latitude") is not None, f"club {c['name']} missing latitude"
            assert c.get("longitude") is not None, f"club {c['name']} missing longitude"
            assert isinstance(c["latitude"], (int, float))
            assert isinstance(c["longitude"], (int, float))

    def test_paris_club_coords(self):
        marc_tok, _ = _login("marc@padel.fr")
        clubs = requests.get(f"{API}/clubs", headers=_auth(marc_tok), timeout=30).json()
        paris = next((c for c in clubs if c["name"] == "Padel Horizon Paris"), None)
        assert paris is not None
        assert abs(paris["latitude"] - 48.8566) < 0.01
        assert abs(paris["longitude"] - 2.3522) < 0.01

    def test_get_club_detail_has_coords(self):
        marc_tok, _ = _login("marc@padel.fr")
        clubs = requests.get(f"{API}/clubs", headers=_auth(marc_tok), timeout=30).json()
        cid = clubs[0]["id"]
        r = requests.get(f"{API}/clubs/{cid}", headers=_auth(marc_tok), timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body.get("latitude") is not None
        assert body.get("longitude") is not None


# ---------- Regression ----------
class TestRegression:
    def test_all_six_demo_users_login(self):
        for em in ["marc@padel.fr", "julie@padel.fr", "thomas@padel.fr",
                   "sophie@padel.fr", "kevin@padel.fr", "lea@padel.fr"]:
            tok, u = _login(em)
            assert u["email"] == em

    def test_clubs_list_has_announcement_badges(self):
        marc_tok, _ = _login("marc@padel.fr")
        clubs = requests.get(f"{API}/clubs", headers=_auth(marc_tok), timeout=30).json()
        assert len(clubs) >= 12
        with_ann = [c for c in clubs if c["announcements_count"] > 0]
        assert len(with_ann) >= 3

    def test_post_message_and_read(self):
        marc_tok, marc = _login("marc@padel.fr")
        julie_tok, julie = _login("julie@padel.fr")
        content = f"TEST_reg_{uuid.uuid4().hex[:6]}"
        s = requests.post(f"{API}/messages", json={"to_user_id": julie["id"], "content": content},
                          headers=_auth(marc_tok), timeout=30)
        assert s.status_code == 200
        conv = requests.get(f"{API}/messages/{marc['id']}", headers=_auth(julie_tok), timeout=30).json()
        assert any(m["content"] == content for m in conv)
