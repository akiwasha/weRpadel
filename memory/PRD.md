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
