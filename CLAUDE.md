# Life Dashboard

Personal Android app (Expo) + Next.js API + shared zod contracts. Always load the `life-dashboard-conventions` skill (`.claude/skills/life-dashboard-conventions/`) before changing anything, and read `apps/mobile/AGENTS.md` before touching Expo code.

Commands (repo root):
- `npm run api` — start the API on port 3000 (needs `apps/api/.env.local`)
- `npm run mobile` — start the Expo dev server
- `npm run typecheck` — typecheck every workspace

## Environnement

- Windows dev machine, no local Android SDK: never rely on `expo run:android` or Android Studio.
- Testing happens in **Expo Go**: `npx expo start` in `apps/mobile`.
- `expo-notifications` does not load in Expo Go on Android. It is loaded on demand in `src/lib/notifications.ts`; **never import it at the top of any file**. Every caller must handle "notifications unavailable" (`scheduleDaily` returns `false`, `notificationsAvailable()`).
- Native builds go through **EAS cloud**. `expo-dev-client` and `eas.json` are not configured yet.
- The backend runs on the user's PC over plain HTTP (`http://<LAN IP>:3000`) during development. A release build must use HTTPS.

Recommended skills for this repo: `expo` (expo/skills), `claude-api` (anthropics/skills), `react-native-best-practices` (callstack), plus the installed `engineering:*` and `ui-ux-pro-max` skills.
