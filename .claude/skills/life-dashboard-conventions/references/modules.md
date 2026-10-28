# Modules — scope and status

Update the **Status** line of a module when you change it.

## Navigation
Three tabs: Aujourd'hui, Modules (hub in src/app/modules/index.tsx, one Stack for all modules), Réglages. New modules get a folder or file under src/app/modules/ and an entry in the hub's SECTIONS, never a new tab.

## Today (src/app/index.tsx)
Scope: daily one-tap logs in one place — water, sleep, treatments taken, today's workout, alerts.
Status: treatments card (Pris / Manqué / Annuler per scheduled dose, yesterday catch-up, stock and prescription alerts); hydration +1 glass / undo with goal gauge; sleep bed/wake + quality 1–5. Home-screen widget not started (needs react-native-android-widget, dev build).

## Groceries (src/app/modules/courses.tsx, /api/groceries)
Scope: weekly meal plan → shopping list sorted by aisle, budget (default 60 €), days, people, store (Lidl/Auchan). Prices: user-maintained table (`knownPrices`) beats Claude estimates; later fed by receipt OCR and Open Prices.
Status: generation, storage, aisle grouping and check-off done. Missing: pantry inventory, price table UI, receipt scan.

## Workout (src/app/modules/sport.tsx, /api/workout)
Scope: daily short session (default 10 min), zero equipment, capoeira mobility (hips, adductors, hamstrings, thoracic spine, wrists/shoulders) + very progressive bodyweight strength. Progression driven by RPE feedback of the last 7 sessions.
Status: generation, storage, feedback done. Missing: guided timer, streak with rest days.

## Hair care (src/app/modules/hair-care/, lib/stock.ts, lib/adherence.ts, lib/treatments.ts)
Scope: daily check-off (vitamin, minoxidil, finasteride on some days), stock computed from logged doses, renewal reminder 10 days before running out (finasteride: 1 tablet/day; minoxidil: bottle ml ÷ dose ml × doses/day, with 10 % waste margin), prescription expiry date, monthly photo check with ghost overlay of previous photo, 4 fixed zones, brightness check vs reference.
Privacy: everything local; never sent to Claude. No medical advice in the UI.
Status: phase 1 done — configurable treatments (versioned regimens), one-tap check-off with explicit "missed" + notes, 30-day history with late catch-up, stock from logged events (pool, add/replace box, waste margin), run-out estimate (14-day real average, planned rate fallback), adherence 7/30 d, renewal + prescription reminders (stable ids, recomputed on each check-off) with Today banners as fallback. Phase 2 not started: monthly photos (4 zones, ghost overlay, brightness check, timeline) in a new hair_photos table; phase-1 tables stay as they are.

## Wishlist & savings
Scope: wishlist by category (lifestyle, setup…), monthly savings goal for expensive items, balance entered manually once a month (no bank aggregation for now), optional 30-day cooling-off rule.
Status: not started.

## Apartment search (/api/apartments)
Scope: weekly scan of alert emails (SeLoger, Leboncoin, PAP, Bien'ici, Jinka, Logic-Immo), dedup across sites, score vs criteria, track status. Contract = `ApartmentScan` (same JSON as the `apartment-scan` Claude skill). Goal: trigger and view from the app.
Status: runs today as a Claude skill; API route is a 501 placeholder. Next: Gmail API (read-only) in the API, then a list screen.

## Subscriptions
Scope: renewal dates, J-3 reminder, "Résilier" button opening the Google Play subscriptions center or the service's own cancellation page. Direct cancellation is not possible on Android.
Status: on hold — user wanted it only with in-app cancellation; revisit if the deep-link version is acceptable.

## Portfolio / crypto (later)
Scope: CoinGecko prices, read-only exchange API keys.
Status: not started.
