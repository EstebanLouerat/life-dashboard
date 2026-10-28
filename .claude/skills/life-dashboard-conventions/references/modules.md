# Modules — scope and status

Update the **Status** line of a module when you change it.

## Today (src/app/index.tsx)
Scope: daily one-tap logs in one place — water, sleep, (later) treatments taken, today's workout, alerts.
Status: hydration +1 glass / undo with goal gauge; sleep bed/wake + quality 1–5. Home-screen widget not started (needs react-native-android-widget, dev build).

## Groceries (src/app/courses.tsx, /api/groceries)
Scope: weekly meal plan → shopping list sorted by aisle, budget (default 60 €), days, people, store (Lidl/Auchan). Prices: user-maintained table (`knownPrices`) beats Claude estimates; later fed by receipt OCR and Open Prices.
Status: generation, storage, aisle grouping and check-off done. Missing: pantry inventory, price table UI, receipt scan.

## Workout (src/app/sport.tsx, /api/workout)
Scope: daily short session (default 10 min), zero equipment, capoeira mobility (hips, adductors, hamstrings, thoracic spine, wrists/shoulders) + very progressive bodyweight strength. Progression driven by RPE feedback of the last 7 sessions.
Status: generation, storage, feedback done. Missing: guided timer, streak with rest days.

## Hair treatment
Scope: daily check-off (vitamin, minoxidil, finasteride on some days), stock computed from logged doses, renewal reminder 10 days before running out (finasteride: 1 tablet/day; minoxidil: bottle ml ÷ dose ml × doses/day, with 10 % waste margin), prescription expiry date, monthly photo check with ghost overlay of previous photo, 4 fixed zones, brightness check vs reference.
Privacy: everything local; never sent to Claude.
Status: not started.

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
