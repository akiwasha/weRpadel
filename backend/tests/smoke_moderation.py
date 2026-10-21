import os, sys, requests
B = os.environ["B"]
def login(e, p="password123"):
    r = requests.post(B + "/api/auth/login", json={"email": e, "password": p}); r.raise_for_status()
    return r.json()["token"], r.json()["user"]
tj, julie = login("julie@padel.fr")
tt, thomas = login("thomas@padel.fr")
tm, marc = login("marc@padel.fr")  # admin
H = lambda t: {"Authorization": f"Bearer {t}"}

# 1. clean message passes
r = requests.post(B + "/api/messages", json={"to_user_id": thomas["id"], "content": "Salut ! Partant pour un match samedi matin ?"}, headers=H(tj))
print("clean msg:", r.status_code)
# 2. hateful message refused with warning
r = requests.post(B + "/api/messages", json={"to_user_id": thomas["id"], "content": "Sale arabe de merde, retourne dans ton pays, je vais te casser la gueule"}, headers=H(tj))
print("hate msg:", r.status_code, r.json())
# 3. abusive announcement refused
r = requests.get(B + "/api/clubs?search=Boulogne", headers=H(tj)).json()
club_id = r[0]["id"]
r = requests.post(B + f"/api/clubs/{club_id}/announcements", json={"content": "Les pédés et les noirs pas la peine de venir, bande de sous-hommes", "party_size": 1}, headers=H(tj))
print("hate ann:", r.status_code, r.json())
# 4. bio refused
r = requests.put(B + "/api/auth/me", json={"bio": "Je déteste les juifs, il faut tous les exterminer"}, headers=H(tj))
print("hate bio (3rd -> suspended):", r.status_code, r.json())
# 5. suspended user can't login / call
r = requests.post(B + "/api/auth/login", json={"email": "julie@padel.fr", "password": "password123"})
print("login suspended:", r.status_code, r.json())
r = requests.get(B + "/api/auth/me", headers=H(tj)); print("me suspended:", r.status_code)
# 6. report + block by thomas against julie
r = requests.post(B + "/api/reports", json={"reported_user_id": julie["id"], "reason": "hate", "details": "Messages racistes", "context_type": "profile"}, headers=H(tt))
print("report:", r.status_code, r.json().get("reason_label"))
r = requests.post(B + f"/api/users/{julie['id']}/block", headers=H(tt)); print("block:", r.status_code, r.json())
r = requests.get(B + "/api/users/blocked", headers=H(tt)); print("blocked list:", r.status_code, [u["pseudo"] for u in r.json()])
r = requests.get(B + f"/api/users/{julie['id']}", headers=H(tt)); print("is_blocked flag:", r.json().get("is_blocked"))
r = requests.post(B + "/api/messages", json={"to_user_id": julie["id"], "content": "coucou"}, headers=H(tt)); print("msg to blocked:", r.status_code, r.json())
# 7. admin
r = requests.get(B + "/api/admin/reports", headers=H(tm)); print("admin reports:", r.status_code, len(r.json()), r.json()[0]["reported"]["suspended"] if r.json() else None)
r = requests.get(B + "/api/admin/reports", headers=H(tt)); print("non-admin reports:", r.status_code)
rid = requests.get(B + "/api/admin/reports", headers=H(tm)).json()[0]["id"]
r = requests.patch(B + f"/api/admin/reports/{rid}", json={"status": "resolved"}, headers=H(tm)); print("resolve:", r.status_code, r.json()["status"])
r = requests.post(B + f"/api/admin/users/{julie['id']}/unsuspend", headers=H(tm)); print("unsuspend:", r.status_code, r.json())
r = requests.post(B + "/api/auth/login", json={"email": "julie@padel.fr", "password": "password123"}); print("login after unsuspend:", r.status_code, r.json()["user"]["warnings"])
r = requests.get(B + "/api/admin/moderation/events", headers=H(tm)); print("events:", r.status_code, len(r.json()))
# cleanup
requests.delete(B + f"/api/users/{julie['id']}/block", headers=H(tt))
r = requests.put(B + "/api/auth/me", json={"bio": "Compétitrice mais fair-play. Toujours partante pour un match."}, headers=H(login("julie@padel.fr")[0])); print("restore bio:", r.status_code)
