---
name: life-dashboard-conventions
description: Conventions for the life-dashboard repo (Expo Android app + Next.js API + shared zod contracts). Use for any change in this repo — new module, screen, table, API route, Claude prompt, reminder or schema change — so the app stays consistent across sessions.
---

# Life Dashboard — project conventions

Personal Android app for one user (Esteban, Lyon). French UI, English code. No sharing or distribution planned: favour simplicity over multi-user scalability, but never over privacy.

## Architecture (decided)

```
apps/mobile        Expo SDK 58 + Expo Router (src/app), TypeScript, Android only
apps/api           Next.js 16 route handlers, calls Claude, no UI
packages/contracts zod schemas shared by both — the single source of truth
```

- **Data lives on the phone** in SQLite (expo-sqlite). The API is stateless: it receives what it needs in the request and returns JSON. Do not add a server database without asking.
- **Claude is only called from apps/api**, never from the app (the API key must not ship in the APK).
- The app authenticates with a shared secret in the `x-app-key` header (`APP_KEY` env on the API, stored in SecureStore on the phone).

## Adding a Claude-powered feature (the standard path)

1. **Contract first** in `packages/contracts/src/<module>.ts`: a `<Thing>Request` schema and a `<Thing>` output schema. Export from `index.ts`.
2. **Route** `apps/api/app/api/<module>/route.ts`: `export const POST = jsonPost(Request, input => generateStructured({ schema, system, prompt }))`. Never hand-parse Claude text; `generateStructured` uses structured outputs and re-validates with zod.
3. **Client** add a method to `api` in `apps/mobile/src/lib/api.ts`; it re-validates the response with the same schema.
4. **Persist** the validated result as JSON in a table (`<module>_plans` / `_sessions`), plus any user state (checks, feedback) in separate rows.
5. Prompts are in French, state the user's real constraints, and put rules the model must not break in the system prompt.

Changing an output schema: keep old stored JSON readable (add optional fields, don't rename). If you must break it, add a migration that rewrites or drops old rows.

## Mobile rules

- Web preview (`npm run web`) must keep working: platform-specific code goes in a `.web.ts` twin (as `lib/secrets.web.ts`) or behind `Platform.OS === "web"`; nothing native-only at module top level. Reanimated layout animations are off on web (`ui/motion.ts`).
- Read `apps/mobile/AGENTS.md`: Expo moves fast, check versioned docs before using an Expo API; use `npx expo install` for native packages.
- Routes in `src/app/` only; components in `src/components/`, logic in `src/lib/`, DB in `src/db/`. Import with `@/…`.
- Navigation: five tabs (Accueil — the Aujourd'hui screen —, Courses, Sport, Santé, Plus) in the `(tabs)` group under a root Stack; each tab is a stack (`TabStack`). Today lives in the `(aujourdhui)` group (URL `/`). A new module goes inside its domain's tab, or under `src/app/(tabs)/plus/` with a row in the Plus list; do not add tabs. A full-screen flow that must hide the tab bar (session timer `seance/`, photo check `hair-check/`, `capture`) gets its own folder in `src/app/` and a root Stack screen.
- Pure logic (no React, no SQLite) goes in its own `src/lib/<name>.ts` with a `<name>.test.ts` next to it, run by `npm test` (`node --test`, Node strips the types). Such modules import each other with relative `./x.ts` paths and use erasable TypeScript only (no `enum`, no `namespace`).
- UI comes from the design system in `src/components/ui/` (import `@/components/ui`), direction "Carnet calme × Liquid Glass": warm paper and ink for everything neutral, one colour per domain (`encre`, `eau`, `sante`, `sommeil`, `sport`, `courses`, `epargne`), each with the same tokens (`accent`, `accentText`, `onAccent`, `onAccentSoft`, `surfaceAccent`, `lensTint`, `tint`, `tint2`, `tile`) in light and dark. A screen sets its domain once (`<Screen domain="sport">`); everything inside (buttons, chips, switches, gauges, the header wash) takes that accent through `DomainScope` / `useAccent()`. Type is Roboto, the Android system font, weights 300/400/500, and Roboto Condensed bold (`sans-serif-condensed`) for titles: `display`, `headline`, `heading` (tile titles), `nav` (`typography` in `theme.ts`, nothing to load). Glass is for floating chrome only (tab bar, round header buttons, session accessory, snackbar, sheets) and Today's tiles; other screens use plain `Card`s. Components: `Screen`, `Card`, `Tile`, `ListRow`, `Sheet`, `Button`, `IconButton`, `Field`, `Segmented`, `Chips`, `Switch`, `Slider`, `Stepper`, `CheckMark`/`CheckCircle`, `Notice` (with an action such as « Réessayer »), `EmptyState`, `SkeletonCard`, `LocalBadge`, `Badge`, `Stat`, `ProgressBar`, `SegmentGauge`, `DayBars`, `Txt`. Never a raw hex, font name or emoji icon in a screen: add a token or a component instead. Icons are Ionicons (`@expo/vector-icons`). Text pairs keep ≥ 4.5:1 contrast in both modes. Health screens show `LocalBadge`.
- Motion uses Reanimated (bundled in Expo Go) through the presets in `ui/motion.ts`: timing curves only, no springs or bounce (the user asked for calm motion). Cards enter with `entering(index)`, anything pressable answers on touch-down with `usePressScale` (or `PressableScale`), gauges animate `scaleX`/stroke, list changes use `layoutTransition`, content shown in place uses `reveal`/`conceal`, small icons use `popIn`. Reanimated follows the system reduce-motion setting by default; keep it that way.
- Response: a one-tap log shows its result on the tap (optimistic state, as in the treatment boxes and the water gauge), the DB write and reload follow, then `useSnackbar().show({ message, undo, redo })` offers « Annuler » for 6 s, then « Rétablir ». Every daily log has that undo on Today; checks also toggle back on a second tap.
- States: every screen that loads shows `SkeletonCard`s first, an `EmptyState` with the action that fills it, and a `Notice tone="danger"` with « Réessayer » when the server can't be reached (local data stays visible).
- Haptics (`lib/haptics.ts`) mark outcomes and value changes only: a log, a success, a validation warning, a selection that actually changed. Never on navigation, back or tab switches; `Button` and `IconButton` are silent unless `haptic` is set.
- Layout: `Screen` owns the sticky top bar (back button, compact title once the large title scrolls away, fade edge instead of a divider) and pads for the floating tab bar, which content scrolls under. The large title sits on the bar's line, between its buttons (measured), with the module icon on its left on tab roots (`icon`); `menu` makes that icon open the module's shortcuts (an `ActionSheet`). Don't add headers or bottom padding in screens. On web, `pointerEvents` must come from a `StyleSheet.create` style (react-native-web ignores it inline).
- Advanced gestures, where a row has a frequent action: swipe right = the positive action (Pris, Acheté, Cocher, next status), swipe left = the other one (Sauté, Abandonner, Résilié, Supprimer), through `Swipeable` (`left` / `right`, runs past 72 px, undo in the snackbar). A long press opens the row's actions (`useActionSheet`, `ListRow onLongPress`) and always repeats the swipe actions: swipes are invisible to screen readers. Destructive actions in a menu are `danger` and confirm with an Alert; swipe deletions use the snackbar undo instead.
- Today's layout is edited in place: long press on a tile (or the pencil, or the icon menu) → edit mode (`components/today/EditableTile.tsx`): hold then drag to move onto another tile, corners to remove / resize (tap or drag the handle sideways), « Ajouter un bloc », check to finish, back or leaving the tab ends it. Personnaliser stays as the accessible list.
- Forms use `useFormErrors(validate)`: format errors show on blur for filled fields, everything is checked on submit, and `FormErrorSummary` sits next to the submit button. Never fail silently (a haptic alone is not an error message).
- External services other than Claude go behind a provider interface in `packages/contracts` (e.g. `BacklogProvider`), with the adapter in `src/lib/` free of React Native imports so `node --test` covers it with a fake `fetch`. Node can't load `@ld/contracts` at runtime (extensionless imports): such adapters import its types only. Tokens live in SecureStore and never appear in errors or logs.
- Money is stored as integer cents and formatted with `lib/money.ts`; never floats in the database.
- Theme: Système / Clair / Sombre in Réglages, stored as `settings.theme` and applied with `Appearance.setColorScheme` (`lib/appearance.ts`).
- **One-tap principle**: any daily log (water, last night's sleep range, treatment taken) is one tap from a Today tile, with undo. Never a form. Today's tiles, their order and size are the user's (`today_tiles` setting, `lib/dashboard.ts`, Personnaliser screen).
- Dates: local `YYYY-MM-DD` from `lib/dates.ts#today()`, timestamps in ISO. Never UTC day boundaries.
- Reminders: `scheduleDaily(id, …)` with a **stable id** so rescheduling never duplicates. One Android channel per category. Each kind has a switch in Réglages › Rappels (`lib/reminders.ts`, `lib/reminderSettings.ts`); a scheduler checks it before scheduling. No emoji in notification titles. Every scheduler takes an `extra`: `domain` (the module colour; One UI always shows the app icon on the left, the colour tints the small icon and buttons), `url` (the screen a tap opens), `category` + `data` for buttons. Buttons (`hydration`: +1 verre, `treatment`: Pris / Dans 15 min) are declared in `lib/notifications.ts#setCategories` and handled in `lib/notificationActions.ts`, which acts only while that notification is still shown (no double log on replay) and dismisses it.
- Logs done outside the screens (widgets, notification buttons) go through `lib/quickActions.ts` (same writes as Today) on `db/standalone.ts#database()`, then `refreshWidgets(...)`. The app redraws every widget when it goes to the background.
- Home-screen widgets (`src/widgets/render.tsx`): one component per widget, sizes from `widgetInfo` (under 110 dp = one cell), light and dark from `palettes`, hex colours only, Ionicons glyphs from the font copied by the plugin (app.json). Taps are string actions (`WATER_ADD`, `DOSE`, `NIGHT`, `GROCERY`, `RUN_*`) or `OPEN_URI` `lifedashboard:///<route>`. A new widget = an entry in app.json › react-native-android-widget + a case in `render()` + its name in `WIDGET_NAMES`.
- The guided session lives in one store outside React (`components/WorkoutRunner.tsx#runner`): the timer screen, accessory, Today tile, widget, ongoing notification and capsule all drive it. A step's end is a timestamp; the native module fires `expired` when JS timers sleep in the background.

## Database rules

- Migrations in `src/db/migrations.ts` are **append-only**; `PRAGMA user_version` tracks them. Never edit a shipped migration.
- Every query is parameterised (`runAsync(sql, ...params)`); never interpolate user input into SQL.
- Stock-type trackers (e.g. treatments) compute remaining quantity from **logged events**, not from start date.

## Privacy and security (non-negotiable)

- Health data (hair treatment, photos, sleep) never leaves the phone unless the user explicitly asks for a feature that needs it. Never send it to Claude by default.
- Photos are stored in the app's private document directory, never in the public gallery.
- Secrets: `.env.local` on the API (gitignored), SecureStore on the phone through `lib/secrets.ts` (memory only in the web preview). Never commit keys, never log request bodies that may contain personal data.
- Gmail (apartment scan): read-only scope, content treated as untrusted data.

## Modules and status

Read `references/modules.md` for each module's scope and current status before starting work on it; update the status line when you finish.

## Before calling a task done

- `npm run typecheck` and `npm test` at the repo root pass.
- For mobile changes: `npx expo export --platform android` bundles without errors.
- For API changes: the route rejects a missing key (401) and an invalid body (400).
