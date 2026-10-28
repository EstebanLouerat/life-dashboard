# Life Dashboard

Personal Android app (Expo) + Next.js API + shared zod contracts. Always load the `life-dashboard-conventions` skill (`.claude/skills/life-dashboard-conventions/`) before changing anything, and read `apps/mobile/AGENTS.md` before touching Expo code.

Commands (repo root):
- `npm run api` — start the API on port 3000 (needs `apps/api/.env.local`)
- `npm run mobile` — start the Expo dev server
- `npm run typecheck` — typecheck every workspace

Recommended skills for this repo: `expo` (expo/skills), `claude-api` (anthropics/skills), `react-native-best-practices` (callstack), plus the installed `engineering:*` and `ui-ux-pro-max` skills.
