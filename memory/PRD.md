# PadelConnect — Product Requirements Document

## Vision
Application mobile de mise en relation entre joueurs de padel amateurs en France. Sans partage de numéros de téléphone : tout se passe via une messagerie interne.

## Core Features (MVP)
1. **Authentification email/password** (JWT, bcrypt, SecureStore).
2. **Profil joueur** : pseudo, avatar (upload photo ou preset), niveau (Débutant/Intermédiaire/Confirmé/Expert), bio, note de fiabilité (moyenne étoiles).
3. **Annuaire des clubs de padel** : 12 clubs de démo pré-remplis sur toute la France, recherche par nom/ville, filtre par région (chips scrollables).
4. **Suggestion de club** : tout membre peut proposer un nouveau club (approved=false, en attente).
5. **Chat collectif par club** (annonces) : chaque membre poste "je cherche un partenaire" + disponibilité.
6. **Profil public joueur** : consultable via annonces ou chat, avec système de notation par étoiles (1-5).
7. **Messagerie privée 1-to-1** : conversations persistées, polling 5s pour nouveaux messages, marquage lu automatique.

## Tech Stack
- **Frontend** : Expo SDK 54, expo-router, expo-image, expo-image-picker, expo-secure-store, react-native-safe-area-context, @expo/vector-icons.
- **Backend** : FastAPI + Motor (async MongoDB), bcrypt, PyJWT.
- **Storage** : Emergent Object Storage pour les avatars.
- **Auth** : JWT HS256, 30 jours, stocké en SecureStore.

## Design
- **Thème** : Tactile / Playful LIGHT.
- **Couleur primaire** : #FF6B15 (orange padel).
- **Cartes de club** : image + gradient scrim + badge annonces actives.
- **Chips région** : horizontales, scroll horizontal uniquement, taille fixe.

## Endpoints backend (préfixe /api)
- POST /auth/register, /auth/login  |  GET/PUT /auth/me
- GET /users/{id}, POST /users/{id}/rate
- GET /clubs, /clubs/regions, /clubs/{id}  |  POST /clubs
- GET /clubs/{id}/announcements, POST /clubs/{id}/announcements
- GET /messages/conversations, /messages/{other_id}, POST /messages
- POST /upload/avatar, GET /files/{path}

## Business enhancement idea (future)
- Système de "matchs organisés" avec réservation de créneau et validation par les 4 joueurs.
- Freemium : profils premium avec badges vérifiés + statistiques détaillées.

## Monétisation — Abonnement Premium (implémenté 2026-08-14)
- **RevenueCat** (Emergent-managed) — entitlement `pro`, offering `default`, package `$rc_annual`.
- **Prix : 9,90 €/an**, auto-renouvelable, **sans essai gratuit**.
- **Modèle freemium** :
  - GRATUIT : inscription, parcourir les clubs (liste + carte), voir annonces & profils, notation.
  - PREMIUM requis : envoyer des messages privés (chat) + poster des annonces de club.
- Paywall : `/app/frontend/app/paywall.tsx`. Hook : `src/lib/revenuecat.tsx` (`useSubscription`).
- Gating : composers verrouillés dans `chat/[id].tsx` et `club/[id].tsx` → redirigent vers `/paywall`.
- Identity : `Purchases.logIn(user.id)` dans `_layout.tsx` sur chaque auth.
- ⚠️ Paiement réel uniquement sur build iOS/Android déployé. En preview/Expo Go : RevenueCat Test Store (prix affiché $79.99 = artefact du test store).
- Détails/IDs : voir `/app/memory/revenuecat.md`.

## Autres features livrées (2026-08-14)
- Badge "Joueur vérifié" (fiabilité ≥ 4,5 sur ≥ 5 avis) affiché partout.
- Pastille de messages non lus sur l'onglet Messages.
- Carte géolocalisée des clubs (react-native-maps + expo-location) avec toggle Liste/Carte.

## Matchmaking avancé (2026-08-14)
- Match à 4 joueurs : join/leave, joueurs hors-app nommés (pastille grise).
- Historique /matches : onglets À venir / En cours / Passés. "Passés" = uniquement les matchs 4/4.
- Rejouer : dupliquer un match 4/4 passé en choisissant une nouvelle date/heure.
- Joueurs favoris (cœur privé).
- Tarifs terrain par club (1h / 1h30 / 2h + coût ÷ 4 joueurs).

## Créneaux début→fin + statut auto (Itération 11)
- Chaque match a un `match_date` (début) ET un `match_end_date` (fin), choisis via MatchDatePicker (Date + Heure de début + Durée 1h/1h30/2h).
- Statut calculé backend `match_status(start, end)` : upcoming / ongoing / past. Dès que l'heure de fin est franchie → le match bascule automatiquement dans l'onglet "Passés".

## Note d'après-match (Itération 11)
- Pour un match 4/4 dont l'heure de fin est passée, chaque joueur réel peut noter la FIABILITÉ (1-5 ⭐) de ses co-équipiers réels (pas les joueurs hors-app, pas soi-même).
- Endpoint `POST /api/announcements/{id}/rate` body `{ratings:[{user_id,stars}]}` → applique les notes (reliability_sum/count) et marque `rated_by`. Champs serialize : `can_rate`, `has_rated`.
- UI /matches : modal d'invitation auto-ouvert si note en attente + bouton "Noter la fiabilité des joueurs" par carte ; après validation → "Joueurs notés · merci !".

## Suppression de compte + touches bleu pastel (Itération 14)
- **Suppression de compte** : bouton "Supprimer mon compte" dans le Profil (double confirmation `Alert`). Endpoint `DELETE /api/auth/me` (authentifié) qui cascade : supprime le user, ses matchs créés, le retire des autres matchs (players/muted_by/rated_by), supprime ses notes (et rééquilibre la fiabilité des joueurs qu'il avait notés), ses messages, et le retire des favoris des autres. Vérifié en curl : 200 puis 401 sur /auth/me + login ; toutes les collections nettoyées.
- **Touches bleu pastel** : tokens thème `info`/`infoMuted (#DCE9FF)`/`onInfoMuted`. Barre de recherche des Clubs et fond des conversations Messages en bleu pastel pour une identité orange+bleu cohérente.
- (Le filtre par ville a été écarté : la proximité est déjà couverte par la carte géolocalisée.)

## Inscription enrichie + confidentialité (Itération 13)
- À l'inscription on collecte : **prénom, nom, pseudonyme, email, téléphone, date de naissance (JJ/MM/AAAA → stocké YYYY-MM-DD), ville** (+ mot de passe). Tous **requis**.
- **Seul le `pseudo` est public.** prénom/nom/email/téléphone/date de naissance/ville sont **privés** : renvoyés uniquement dans `/auth/me` (register/login/me via helper `user_me`) et éditables via `PUT /auth/me`. `user_public` (endpoints publics `/users/{id}`, annonces, joueurs) n'expose JAMAIS ces champs. Vérifié : aucune fuite sur `/users/{id}`, register sans ces champs → 422.
- UI : `sign-up.tsx` (bandeau confidentialité + tag "public" sur pseudo), `profile.tsx` carte "Mes infos (privées)" 🔒, `edit-profile.tsx` section "Coordonnées privées" éditable.

## Notification "Match complet" (Emergent Push — Itération 11)
- Emergent managed push (relay SuprSend). Endpoints backend : `POST /api/register-push` + helper `send_push`.
- Déclenchement : quand le 4e joueur rejoint un match (`/announcements/{id}/join` → 4/4), l'ORGANISATEUR reçoit une push "Match complet ! 🎾" avec `action_url` `/club/{club_id}`. Envoi wrappé try/except (non bloquant).
- Frontend : `app/_layout.tsx` (handler + channel Android au module scope, tap handlers warm/cold, nudge hebdo si permission refusée) ; `src/lib/push.ts` `registerForPush(userId)` appelé à chaque auth.
- Config : `app.json` plugin `expo-notifications` + `android.googleServicesFile: ./google-services.json`.
- ⚠️ Ne fonctionne PAS en Expo Go / preview web. Nécessite build iOS/Android réel. `EMERGENT_PUSH_KEY=placeholder` (remplacé par le déployeur au build). L'utilisateur doit fournir `google-services.json` (Firebase, package `com.emergent.padelplay.y9om9x`) + clé APNs `.p8` (iOS) et Google service account JSON (Android) au moment du build.

## Rappels de match programmés (Itération 12)
- Scheduler backend `reminder_loop` (asyncio, tick toutes les 5 min) lancé au startup. `reminder_tick()` parcourt les matchs à venir avec `match_date` :
  - **24h avant** (fenêtre 2h < delta ≤ 24h) → push "Rappel de match 🎾" ; flag `reminded_24h`.
  - **2h avant** (0 < delta ≤ 2h) → push "Ton match commence bientôt ⏰" ; flag `reminded_2h`.
- Heure affichée en fuseau Europe/Paris (`zoneinfo`). Envoi non bloquant (try/except) + `$idempotency_key` (remind24-/remind2-) pour dédup côté relay. Flags posés même si l'envoi échoue (évite le spam de retries).

## Reproposer la semaine prochaine (Itération 12)
- Bouton sur chaque carte "Passés" 4/4 ayant un `match_date` : recrée en 1 tap le même match +7 jours (même heure/durée, même équipe) via l'endpoint `replay` existant (envoie une invitation par message à chaque co-joueur). Confirmation via `Alert`. testID `weekly-<id>`.

## Couper les rappels par match (Itération 12)
- Chaque joueur peut couper/réactiver les rappels d'un match précis. Champ `muted_by: [user_id]` sur l'annonce. Endpoint toggle `POST /api/announcements/{id}/mute`. serialize → `reminders_muted` (pour le viewer).
- `reminder_tick` exclut les user_id présents dans `muted_by` des destinataires push.
- UI /matches (onglet "À venir", carte avec `match_date`) : bouton cloche `mute-<id>` "Rappels activés (24h + 2h avant)" ↔ "Rappels coupés · toucher pour réactiver".

## Recherche de match + Météo + Clubs proches (Itération 15)
- **Recherche de match** : nouvel onglet "Rechercher" (`app/(tabs)/search.tsx`) qui agrège TOUS les matchs ouverts (non complets, à venir ou sans date) de tous les clubs. Filtres : niveau de l'organisateur (Tous/Débutant/…/Expert), date rapide (Toutes/Aujourd'hui/Demain/Après-demain), région, recherche texte (club/ville). Bouton "Rejoindre le match" (gating abonnement → paywall). Endpoint `GET /api/matches/open?level=&date=&region=&search=`.
- **Météo Open-Meteo (sans clé)** : champ `is_outdoor` par club (togglé par l'admin dans `/admin-clubs`, testID `admin-outdoor-<id>`). Endpoint `GET /api/clubs/{id}/weather` → `{outdoor, days[7]}` (weather_code→label FR + icône Ionicons, temp max/min, précip %). Affichée : (1) onglet Infos du club (carte "Météo à venir", 7 jours) si extérieur ; (2) carte de match "À venir" dans `/matches` (badge météo du jour du match). 2 clubs de démo marqués extérieurs au startup (Padel Riviera, Winners Padel).
- **Clubs les plus proches** : si la recherche de club (onglet Clubs) ne renvoie aucun résultat pour une ville tapée, on géocode la ville (Open-Meteo geocoding) et on affiche les 6 clubs les plus proches (distance haversine, badge "à ~X km"). Endpoint `GET /api/clubs/nearest?q=<ville>&limit=6`. Bannière `nearest-banner`.
- **Horaire des matchs** : `formatMatchRange`/`formatMatchDate` affiche déjà date + heure (ex: "sam 21 juin · 18h → 19h30") partout où un match daté est montré (annonces club, /matches, /search).
