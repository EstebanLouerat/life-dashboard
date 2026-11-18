# Life Dashboard

Personal Android app (Expo) + Next.js API + shared zod contracts. Always load the `life-dashboard-conventions` skill (`.claude/skills/life-dashboard-conventions/`) before changing anything, and read `apps/mobile/AGENTS.md` before touching Expo code.

Commands (repo root):
- `npm run api` — start the API on port 3000 (needs `apps/api/.env.local`)
- `npm run mobile` — start the Expo dev server
- `npm run web` — browser preview of the app (same code, react-native-web): SQLite lives in the browser, no notifications, server key and GitHub token kept in memory only (re-enter after a reload). Android stays the target
- `npm run typecheck` — typecheck every workspace
- `npm test` — unit tests (`node --test` on `apps/mobile/src/lib/*.test.ts`)

## Environnement

- Windows dev machine, no local Android SDK: never rely on `expo run:android` or Android Studio.
- Testing happens in **Expo Go**: `npx expo start` in `apps/mobile`.
- `expo-notifications` does not load in Expo Go on Android. It is loaded on demand in `src/lib/notifications.ts`; **never import it at the top of any file**. Every caller must handle "notifications unavailable" (`scheduleDaily` returns `false`, `notificationsAvailable()`).
- Native builds go through **EAS cloud**. `expo-dev-client` and `eas.json` are not configured yet.
- The backend runs on the user's PC over plain HTTP (`http://<LAN IP>:3000`) during development. A release build must use HTTPS.

## Backlog (GitHub Issues)

The backlog lives in this repository's GitHub issues; the app reads and edits it (Plus → Backlog, the light-bulb button on Today).
- Status: open = to do, open + label `status:doing` = in progress, closed = done. Labels `module:<name>` (route folder: `sante`, `courses`, `wishlist`…) and `bug` / `enhancement` give module and kind.
- Claude Code works on issues labelled `claude-code` only: `gh issue list --label claude-code --state open`.
- Taking one: `gh issue edit <n> --add-label status:doing`, then a branch `issue-<n>-<short-slug>`. Progress or questions go in `gh issue comment <n>`.
- Finishing: the commit or PR says `Closes #<n>`, which closes the issue (done) when it reaches `main`; remove `status:doing` if it stays open.
- `npm run backlog:import` turns the "Missing / Next / Later" items of `references/modules.md` into issues (simulation unless `--apply`, skips titles that exist).
- Tokens never go in the repo or a log: `gh` uses its own login, the app a fine-grained token (this repo only, Issues read/write) in SecureStore.

Recommended skills for this repo: `expo` (expo/skills), `claude-api` (anthropics/skills), `react-native-best-practices` (callstack), plus the installed `engineering:*` and `ui-ux-pro-max` skills.
