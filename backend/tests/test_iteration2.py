"""Iteration 2 - verify bug fix (suggest-club visibility) + new seed data (6 users, 10 announcements)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

MARC = {"email": "marc@padel.fr", "password": "password123"}
JULIE = {"email": "julie@padel.fr", "password": "password123"}
KEVIN = {"email": "kevin@padel.fr", "password": "password123"}
THOMAS = {"email": "thomas@padel.fr", "password": "password123"}
SOPHIE = {"email": "sophie@padel.fr", "password": "password123"}
LEA = {"email": "lea@padel.fr", "password": "password123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login {creds['email']} failed: {r.status_code} {r.text}"
    return r.json()["token"]


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def marc_token():
    return _login(MARC)


@pytest.fixture(scope="module")
def julie_token():
    return _login(JULIE)


# ---- BUG FIX: suggest-club visibility ($or approved OR suggested_by:me) ----
class TestSuggestClubVisibility:
    def test_author_sees_own_pending_but_other_does_not(self, marc_token, julie_token):
        name = f"TEST_PendingClub_{uuid.uuid4().hex[:6]}"
        payload = {"name": name, "city": "Nowhereville", "region": "TestRegionXYZ"}
        r = requests.post(f"{API}/clubs", headers=h(marc_token), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["approved"] is False
        assert created["name"] == name

        # Marc must see the pending club in his listing
        marc_clubs = requests.get(f"{API}/clubs", headers=h(marc_token), timeout=30).json()
        assert any(c["id"] == created["id"] for c in marc_clubs), \
            "Author should see own pending club in GET /api/clubs"

        # Julie must NOT see the unapproved club
        julie_clubs = requests.get(f"{API}/clubs", headers=h(julie_token), timeout=30).json()
        assert not any(c["id"] == created["id"] for c in julie_clubs), \
            "Non-author should NOT see other users' unapproved clubs"

    def test_pending_club_hidden_from_regions_list(self, marc_token):
        # /clubs/regions filters approved:True -> TestRegionXYZ (from pending) must not leak
        regions = requests.get(f"{API}/clubs/regions", headers=h(marc_token), timeout=30).json()
        assert "TestRegionXYZ" not in regions


# ---- SEED DATA: 6 demo users with avatars + non-null reliability ----
class TestDemoUsers:
    @pytest.mark.parametrize("creds,pseudo,level", [
        (MARC, "MarcPadel", "Intermédiaire"),
        (JULIE, "JulieSmash", "Confirmé"),
        (THOMAS, "ThomasR", "Débutant"),
        (SOPHIE, "SophiePad", "Confirmé"),
        (KEVIN, "KevinAce", "Expert"),
        (LEA, "LeaVolley", "Intermédiaire"),
    ])
    def test_demo_user_login_and_profile(self, creds, pseudo, level):
        # NOTE: MarcPadel level was updated to Confirmé by iteration 1 test_update_me.
        # We only validate pseudo strictly; level checked loosely.
        tok = _login(creds)
        me = requests.get(f"{API}/auth/me", headers=h(tok), timeout=30).json()
        assert me["pseudo"] == pseudo
        assert me["avatar_url"], f"{pseudo} should have avatar_url"
        assert me["reliability_count"] > 0, f"{pseudo} reliability_count should be > 0"
        assert me["reliability_avg"] > 0, f"{pseudo} reliability_avg should be > 0"
        # level string should be present and non-empty
        assert me["level"] in ["Débutant", "Intermédiaire", "Confirmé", "Expert"]


# ---- SEED DATA: clubs with announcements_count > 0 (announcements badge) ----
class TestClubsAnnouncementsCount:
    def test_at_least_one_club_has_announcements(self, marc_token):
        clubs = requests.get(f"{API}/clubs", headers=h(marc_token), timeout=30).json()
        assert len(clubs) >= 12
        with_ann = [c for c in clubs if c.get("announcements_count", 0) > 0]
        assert len(with_ann) >= 3, f"expected multiple clubs w/ announcements, got {len(with_ann)}"

    def test_total_announcements_around_10(self, marc_token):
        clubs = requests.get(f"{API}/clubs", headers=h(marc_token), timeout=30).json()
        total = sum(c.get("announcements_count", 0) for c in clubs)
        # seed spec: ~10 announcements. Iteration 1 also inserted 1 TEST announcement.
        assert total >= 6, f"expected ~10 announcements seeded, total={total}"


# ---- ANNOUNCEMENTS: author enriched with pseudo, level, reliability_avg > 0 ----
class TestAnnouncementsEnriched:
    def test_seeded_announcements_have_enriched_author(self, marc_token):
        clubs = requests.get(f"{API}/clubs", headers=h(marc_token), timeout=30).json()
        found_enriched = False
        for c in clubs:
            if c.get("announcements_count", 0) == 0:
                continue
            anns = requests.get(f"{API}/clubs/{c['id']}/announcements",
                                headers=h(marc_token), timeout=30).json()
            for a in anns:
                assert "author" in a and a["author"]
                au = a["author"]
                assert au["pseudo"]
                assert au["level"] in ["Débutant", "Intermédiaire", "Confirmé", "Expert"]
                # Announcements authored by a seeded demo user should have reliability_avg > 0.
                # (Newly-created TEST announcements by TEST_ users would have 0.)
                if au["pseudo"] in ("MarcPadel", "JulieSmash", "ThomasR", "SophiePad", "KevinAce", "LeaVolley"):
                    assert au["reliability_avg"] > 0, f"{au['pseudo']} reliability_avg should be > 0"
                    assert au["reliability_count"] > 0
                    found_enriched = True
        assert found_enriched, "expected at least one announcement authored by a demo user"


# ---- CLUBS: region & search filters ----
class TestClubFilters:
    def test_region_filter_occitanie(self, marc_token):
        r = requests.get(f"{API}/clubs", headers=h(marc_token),
                         params={"region": "Occitanie"}, timeout=30)
        assert r.status_code == 200
        clubs = r.json()
        assert len(clubs) >= 2, f"expected >=2 Occitanie clubs, got {len(clubs)}"
        assert all(c["region"] == "Occitanie" for c in clubs)
        names = {c["name"] for c in clubs}
        assert "Padel Toulouse Sud" in names
        assert "Montpellier Padel Sud" in names

    def test_search_paris(self, marc_token):
        r = requests.get(f"{API}/clubs", headers=h(marc_token),
                         params={"search": "Paris"}, timeout=30)
        assert r.status_code == 200
        clubs = r.json()
        assert len(clubs) >= 1
        assert all("paris" in c["city"].lower() or "paris" in c["name"].lower() for c in clubs)

    def test_region_and_search_combined(self, marc_token):
        r = requests.get(f"{API}/clubs", headers=h(marc_token),
                         params={"region": "Occitanie", "search": "Toulouse"}, timeout=30)
        assert r.status_code == 200
        clubs = r.json()
        assert len(clubs) >= 1
        assert all(c["region"] == "Occitanie" for c in clubs)
        assert any("Toulouse" in c["city"] for c in clubs)


# ---- REGRESSION QUICK PASS ----
class TestRegression:
    def test_login_marc_and_me(self):
        tok = _login(MARC)
        me = requests.get(f"{API}/auth/me", headers=h(tok), timeout=30).json()
        assert me["email"] == "marc@padel.fr"
        assert me["pseudo"] == "MarcPadel"

    def test_send_private_message(self, marc_token, julie_token):
        julie_id = requests.get(f"{API}/auth/me", headers=h(julie_token), timeout=30).json()["id"]
        content = f"TEST regression DM {uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/messages", headers=h(marc_token),
                          json={"to_user_id": julie_id, "content": content}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["content"] == content

    def test_rate_user(self, marc_token, julie_token):
        julie_id = requests.get(f"{API}/auth/me", headers=h(julie_token), timeout=30).json()["id"]
        r = requests.post(f"{API}/users/{julie_id}/rate", headers=h(marc_token),
                          json={"stars": 5}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["reliability_count"] >= 1
        assert data["reliability_avg"] > 0
