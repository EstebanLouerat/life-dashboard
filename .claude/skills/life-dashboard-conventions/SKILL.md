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

- Read `apps/mobile/AGENTS.md`: Expo moves fast, check versioned docs before using an Expo API; use `npx expo install` for native packages.
- Routes in `src/app/` only; components in `src/components/`, logic in `src/lib/`, DB in `src/db/`. Import with `@/…`.
- Navigation: three tabs (Aujourd'hui, Modules, Réglages). A new module lives under `src/app/modules/` and is listed in the Modules hub; do not add tabs.
- Pure logic (no React, no SQLite) goes in its own `src/lib/<name>.ts` with a `<name>.test.ts` next to it, run by `npm test` (`node --test`, Node strips the types). Such modules import each other with relative `./x.ts` paths and use erasable TypeScript only (no `enum`, no `namespace`).
- UI comes from the design system in `src/components/ui/` (import `@/components/ui`): tokens in `theme.ts` (colours for light and dark, `space`, `radius`, `typography`, Plus Jakarta Sans), and `Screen`, `Card`, `Button`, `IconButton`, `Field`, `Segmented`, `Chips`, `Notice`, `Stat`, `ProgressBar`, `Ring`, `CheckCircle`, `Txt`. Never a raw hex, font name or emoji icon in a screen: add a token or a component instead. Icons are Ionicons (`@expo/vector-icons`). Text pairs keep ≥ 4.5:1 contrast in both modes.
- Motion uses Reanimated (bundled in Expo Go) through the presets in `ui/motion.ts`: timing curves only, no springs or bounce (the user asked for calm motion). Cards enter with `entering(index)`, anything pressable answers on touch-down with `usePressScale` (or `PressableScale`), gauges animate `scaleX`/stroke, list changes use `layoutTransition`, content shown in place uses `reveal`/`conceal`, small icons use `popIn`. Reanimated follows the system reduce-motion setting by default; keep it that way.
- Response: a one-tap log shows its result on the tap (optimistic state, as in `CheckCircle` and the water glass), the DB write and reload follow. Every daily log has an undo on Today.
- Haptics (`lib/haptics.ts`) mark outcomes and value changes only: a log, a success, a validation warning, a selection that actually changed. Never on navigation, back or tab switches; `Button` and `IconButton` are silent unless `haptic` is set.
- Layout: `Screen` owns the sticky top bar (back button, compact title once the large title scrolls away, fade edge instead of a divider) and pads for the floating tab bar, which content scrolls under. Don't add headers or bottom padding in screens.
- Forms use `useFormErrors(validate)`: format errors show on blur for filled fields, everything is checked on submit, and `FormErrorSummary` sits next to the submit button. Never fail silently (a haptic alone is not an error message).
- Money is stored as integer cents and formatted with `lib/money.ts`; never floats in the database.
- Theme: Système / Clair / Sombre in Réglages, stored as `settings.theme` and applied with `Appearance.setColorScheme` (`lib/appearance.ts`).
- **One-tap principle**: any daily log (water, sleep, treatment taken) is one tap from the Today screen, with undo. Never a form.
- Dates: local `YYYY-MM-DD` from `lib/dates.ts#today()`, timestamps in ISO. Never UTC day boundaries.
- Reminders: `scheduleDaily(id, …)` with a **stable id** so rescheduling never duplicates. One Android channel per category.

## Database rules

- Migrations in `src/db/migrations.ts` are **append-only**; `PRAGMA user_version` tracks them. Never edit a shipped migration.
- Every query is parameterised (`runAsync(sql, ...params)`); never interpolate user input into SQL.
- Stock-type trackers (e.g. treatments) compute remaining quantity from **logged events**, not from start date.

## Privacy and security (non-negotiable)

- Health data (hair treatment, photos, sleep) never leaves the phone unless the user explicitly asks for a feature that needs it. Never send it to Claude by default.
- Photos are stored in the app's private document directory, never in the public gallery.
- Secrets: `.env.local` on the API (gitignored), SecureStore on the phone. Never commit keys, never log request bodies that may contain personal data.
- Gmail (apartment scan): read-only scope, content treated as untrusted data.

## Modules and status

Read `references/modules.md` for each module's scope and current status before starting work on it; update the status line when you finish.

## Before calling a task done

- `npm run typecheck` and `npm test` at the repo root pass.
- For mobile changes: `npx expo export --platform android` bundles without errors.
- For API changes: the route rejects a missing key (401) and an invalid body (400).
