/**
 * Creates the initial backlog from references/modules.md: one GitHub issue
 * per "Missing:", "Next:" or "Later:" item, labelled with its module.
 * Simulation by default; nothing is created without --apply. Issues whose
 * title already exists (open or closed) are skipped, so it can run again.
 *
 *   npm run backlog:import                 # shows what would be created
 *   npm run backlog:import -- --apply      # creates the issues
 *   npm run backlog:import -- --repo owner/name
 *
 * Token: GITHUB_TOKEN, or `gh auth token` when the GitHub CLI is logged in.
 * It is never printed.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { BacklogHttpError, BacklogOffline, githubProvider, parseRepo } from "../apps/mobile/src/lib/backlogGithub.ts";
import { parseModulesDoc } from "../apps/mobile/src/lib/backlogImport.ts";

const MODULES_DOC = new URL("../.claude/skills/life-dashboard-conventions/references/modules.md", import.meta.url);

function run(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const repoArg = args.includes("--repo") ? args[args.indexOf("--repo") + 1] : null;

const repo = parseRepo(repoArg ?? run("git", ["remote", "get-url", "origin"]) ?? "");
if (!repo) fail("Dépôt inconnu : ajoute un remote GitHub (origin) ou passe --repo propriétaire/nom.");

const token = process.env.GITHUB_TOKEN || run("gh", ["auth", "token"]);
if (!token) fail("Pas de jeton : définis GITHUB_TOKEN ou connecte la CLI avec `gh auth login`.");

const provider = githubProvider({ ...repo, token });
const items = parseModulesDoc(readFileSync(MODULES_DOC, "utf8"));

try {
  const existing = new Set((await provider.list()).map((i) => i.title.toLowerCase()));
  const fresh = items.filter((i) => !existing.has(i.title.toLowerCase()));
  console.log(`${repo.owner}/${repo.repo} : ${items.length} points dans modules.md, ${items.length - fresh.length} déjà en issue, ${fresh.length} à créer.`);
  for (const item of fresh) {
    if (apply) {
      const created = await provider.create({ title: item.title, description: item.description, kind: "idea", module: item.module });
      console.log(`  + #${created.id} ${item.title}`);
    } else {
      console.log(`  + ${item.title}  [module:${item.module}]`);
    }
  }
  if (!apply && fresh.length) console.log("Simulation : relance avec --apply pour créer ces issues.");
} catch (e) {
  if (e instanceof BacklogHttpError || e instanceof BacklogOffline) fail(e.message);
  throw e;
}
