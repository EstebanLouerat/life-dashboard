# Modules — scope and status

Update the **Status** line of a module when you change it.

## Navigation
Three tabs: Aujourd'hui, Modules (hub in src/app/(tabs)/modules/index.tsx, one Stack for all modules), Réglages. New modules get a folder or file under src/app/(tabs)/modules/ and an entry in the hub's SECTIONS, never a new tab. The root is a Stack: the tabs live in the (tabs) group, and full-screen flows that must hide the tab bar (src/app/hair-check/) are pushed over them from the bottom.

## Today (src/app/(tabs)/index.tsx)
Scope: daily one-tap logs in one place — water, sleep, treatments taken, today's workout, alerts.
Status: hero rings (treatments, water, sleep); treatments card (Pris / Manqué / Annuler per scheduled dose, yesterday catch-up, stock and prescription alerts); « À venir » card (renewals, trial ends, cooling-off ends, monthly savings balance) as the fallback for notifications; hydration +1 glass / undo with goal gauge; sleep bed/wake + quality 1–5. Home-screen widget not started (needs react-native-android-widget, dev build).

## Groceries (src/app/(tabs)/modules/courses.tsx, /api/groceries)
Scope: weekly meal plan → shopping list sorted by aisle, budget (default 60 €), days, people, store (Lidl/Auchan). Prices: user-maintained table (`knownPrices`) beats Claude estimates; later fed by receipt OCR and Open Prices.
Status: generation, storage, aisle grouping and check-off done. Missing: pantry inventory, price table UI, receipt scan.

## Workout (src/app/(tabs)/modules/sport.tsx, /api/workout)
Scope: daily short session (default 10 min), zero equipment, capoeira mobility (hips, adductors, hamstrings, thoracic spine, wrists/shoulders) + very progressive bodyweight strength. Progression driven by RPE feedback of the last 7 sessions.
Status: generation, storage, feedback done. Missing: guided timer, streak with rest days.

## Hair care (src/app/(tabs)/modules/hair-care/, src/app/hair-check/, lib/stock.ts, lib/adherence.ts, lib/treatments.ts, lib/hairPhotos.ts, lib/hairChecks.ts)

Status: phase 1 done — configurable treatments (versioned regimens), one-tap check-off with explicit "missed" + notes, 30-day history with late catch-up, stock from logged events (pool, add/replace box, waste margin), run-out estimate (14-day real average, planned rate fallback), adherence 7/30 d, renewal + prescription reminders (stable ids, recomputed on each check-off) with Today banners as fallback.
Phase 2 done (works in Expo Go) — monthly photo check in tables hair_checks / hair_photos: checklist, guided camera per zone (front camera for hairline and temples, back camera + 10 s countdown for vertex and top), frame, bubble level (DeviceMotion), last photo of the zone as a 40 % ghost, brightness check against the zone's first photo (mean luma of a 64 px copy decoded with jpeg-js, plus EXIF exposure; retake offered past 15 % or 1 EV), notes and side effects, timeline per zone and before/after slider. Photos and thumbnails live in the private document directory (hair/), android.allowBackup is off (effective in EAS builds only). Monthly reminder `hair-check` on the due day + Today banner. To check on a device: level direction, ghost alignment with the front camera mirror, EXIF keys returned by the phone. Later: automatic alignment score, PDF export for the dermatologist.

## Wishlist & savings (src/app/(tabs)/modules/wishlist/, lib/savings.ts, lib/wishlist.ts)
Scope: wishlist by category (lifestyle, setup…), monthly savings goal for expensive items, balance entered manually once a month (no bank aggregation for now), optional 30-day cooling-off rule.
Status: done — items with free categories, priority (envie / important / essentiel), link, notes; cooling-off period per item (default 30 days, 0 = off, early release, end-of-period reminder); monthly balance (table savings_balances, reminder on the 1st) with monthly goal progress and 6-month chart; funding plan (savings poured by priority then age, months left from the monthly goal); bought (price paid) / dropped (counted as saved) / back to list; totals. Next: link wishes to real purchase receipts, price tracking.

## Apartment search (/api/apartments)
Scope: weekly scan of alert emails (SeLoger, Leboncoin, PAP, Bien'ici, Jinka, Logic-Immo), dedup across sites, score vs criteria, track status. Contract = `ApartmentScan` (same JSON as the `apartment-scan` Claude skill). Goal: trigger and view from the app.
Status: runs today as a Claude skill; API route is a 501 placeholder. Next: Gmail API (read-only) in the API, then a list screen.

## Subscriptions (src/app/(tabs)/modules/abonnements/, lib/renewals.ts, lib/subscriptions.ts)
Scope: renewal dates, J-3 reminder, "Résilier" button opening the Google Play subscriptions center or the service's own cancellation page. Direct cancellation is not possible on Android.
Status: done (deep-link version accepted) — weekly / monthly / yearly cycles every N units, renewals derived from one anchor date (month-end clamping), monthly and yearly budget, next-30-days total, breakdown by category, free-trial end, reminders N days before (next 3 renewals + trial end, stable ids), Résilier → Google Play page or the service's URL then "mark cancelled", reactivate, delete.

## Portfolio / crypto (later)
Scope: CoinGecko prices, read-only exchange API keys.
Status: not started.
