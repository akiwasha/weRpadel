# RevenueCat — integrated (2026-08-14)
This file serves as memory for interacting with the user's RevenueCat account via the integration proxy later.

## Identifiers (from /setup response — copy verbatim)
- rc_project_id: proj71049a4c
- apple_app_id: appcdf41ebd4e
- play_app_id: app05175dab1f
- entitlement_lookup_key: pro
- offering_lookup_key: default
- bundle_id / package_name: com.emergent.padelplay.y9om9x
- Packages (package -> product_id, current price):
  - $rc_annual -> prod85a49e74a9   (€9.90 / P1Y, trial: none)  ← ACTIVE, user's only plan
  - $rc_monthly -> REMOVED (deleted per user request; only yearly offered)
- Dashboard: https://app.revenuecat.com/projects/proj71049a4c

## Model
- Freemium: browsing clubs is FREE. Sending private messages + posting club announcements require the `pro` entitlement.
- No free trial. Price €9.90/year, auto-renewable.

## Status check
curl -sS -H "$AUTH" "$INTEGRATION_PROXY_URL/internal/revenuecat/projects/63d9d193-c3b4-4373-9c9c-869f7996f638/status"
(AUTH = 'Authorization: Bearer <emergent key>'; if project_state < project_created, re-fetch playbook via integration expert)

## Later updates (integration proxy APIs ONLY — NEVER call RevenueCat REST API)
- Change price/duration/trial OR add a package (upsert):
  POST $INTEGRATION_PROXY_URL/internal/revenuecat/projects/63d9d193-c3b4-4373-9c9c-869f7996f638/products
  body: {"products":[{"package":"$rc_annual","price":9.90,"currency":"EUR","period":"P1Y","prices":[{"amount_micros":9900000,"currency":"EUR"}]}]}
- Remove a package:
  DELETE $INTEGRATION_PROXY_URL/internal/revenuecat/projects/63d9d193-c3b4-4373-9c9c-869f7996f638/products/%24rc_monthly  ($ -> %24)
- Recover identifiers / repopulate .env: re-run the idempotent /setup call.

## Keys location
- Real SDK keys live in /app/frontend/.env (EXPO_PUBLIC_REVENUECAT_TEST/IOS/ANDROID_API_KEY). Never write them to any other on-disk file.

## Taking IAP LIVE — store-side steps (USER does these; agent cannot perform)
Needed ONLY for REAL purchases in published store builds. Test Store (Expo Go / web preview / dev build) needs none.
1. Upload App Store Connect API key (.p8) + Google Play service-account JSON to RevenueCat dashboard.
2. Set up payment profiles in App Store Connect and Play Console.
3. Create matching IAP products with the SAME product IDs shown in the RevenueCat dashboard.
4. Release build → test via TestFlight / Play internal testing → submit for review.
All steps are documented in the FAQ section of the Emergent payments panel.
