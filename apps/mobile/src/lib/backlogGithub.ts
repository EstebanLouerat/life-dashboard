/**
 * GitHub Issues as the backlog provider. Status lives in the issue state and
 * one label: open = todo, open + `status:doing` = doing, closed = done. Kind
 * and module are labels too. The token is a fine-grained one limited to one
 * repository (Issues: read and write); it only ever goes in the
 * Authorization header to api.github.com, never in an error or a log.
 * No React Native import: tested with a fake fetch, reused by the import script.
 */
import { z } from "zod";
import type { BacklogItem, BacklogKind, BacklogProvider, BacklogStatus, NewBacklogItem } from "@ld/contracts";

export const GITHUB_LABELS = {
  doing: "status:doing",
  modulePrefix: "module:",
  /** Issues Claude Code may pick up (see CLAUDE.md). */
  claudeCode: "claude-code",
  kind: { idea: "enhancement", bug: "bug" } satisfies Record<BacklogKind, string>,
};

const API = "https://api.github.com";
const PER_PAGE = 100;
const MAX_PAGES = 10;

const Issue = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable().optional(),
  state: z.enum(["open", "closed"]),
  labels: z.array(z.union([z.string(), z.object({ name: z.string() })])),
  html_url: z.string(),
  updated_at: z.string(),
  pull_request: z.unknown().optional(),
});
type Issue = z.infer<typeof Issue>;

/** No network (offline, DNS): the caller keeps the change queued. */
export class BacklogOffline extends Error {}

/** GitHub answered with an error; the message is safe to show. */
export class BacklogHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** "owner/name", or a github.com URL, to its parts. */
export function parseRepo(input: string): { owner: string; repo: string } | null {
  const match = /^\s*(?:https:\/\/github\.com\/|git@github\.com:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?\s*$/.exec(input);
  return match ? { owner: match[1], repo: match[2] } : null;
}

const labelName = (l: Issue["labels"][number]) => (typeof l === "string" ? l : l.name);

export function toItem(issue: Issue): BacklogItem {
  const labels = issue.labels.map(labelName);
  const moduleLabel = labels.find((l) => l.startsWith(GITHUB_LABELS.modulePrefix));
  return {
    id: String(issue.number),
    title: issue.title,
    description: issue.body ?? "",
    status: issue.state === "closed" ? "done" : labels.includes(GITHUB_LABELS.doing) ? "doing" : "todo",
    kind: labels.includes(GITHUB_LABELS.kind.bug) ? "bug" : labels.includes(GITHUB_LABELS.kind.idea) ? "idea" : null,
    module: moduleLabel ? moduleLabel.slice(GITHUB_LABELS.modulePrefix.length) || null : null,
    labels,
    url: issue.html_url,
    updatedAt: issue.updated_at,
  };
}

/** Labels of a new issue: its kind, and its module when there is one. */
export function labelsFor(item: NewBacklogItem): string[] {
  const labels: string[] = [GITHUB_LABELS.kind[item.kind]];
  if (item.module) labels.push(`${GITHUB_LABELS.modulePrefix}${item.module}`);
  return labels;
}

/** The labels an issue carries in `status`, every other label kept. */
export function withStatus(labels: string[], status: BacklogStatus): string[] {
  const rest = labels.filter((l) => l !== GITHUB_LABELS.doing);
  return status === "doing" ? [...rest, GITHUB_LABELS.doing] : rest;
}

/** The `rel="next"` URL of a Link header, only if it stays on api.github.com (the token goes with it). */
export function nextPage(link: string | null): string | null {
  const next = link
    ?.split(",")
    .map((part) => part.trim())
    .find((part) => /;\s*rel="next"/.test(part));
  const url = next ? next.slice(next.indexOf("<") + 1, next.indexOf(">")) : null;
  return url && url.startsWith(`${API}/`) ? url : null;
}

function httpMessage(status: number): string {
  if (status === 401) return "Jeton GitHub refusé : vérifie-le dans Réglages.";
  if (status === 403) return "Accès refusé : il faut Issues en lecture et écriture sur ce dépôt (ou la limite d'appels est atteinte).";
  if (status === 404) return "Dépôt ou issue introuvable : vérifie le dépôt et l'accès du jeton.";
  if (status === 410) return "Les issues sont désactivées sur ce dépôt.";
  if (status === 422) return "GitHub a refusé la demande (champ invalide).";
  return `Erreur GitHub ${status}.`;
}

export function githubProvider(opts: { owner: string; repo: string; token: string; fetch?: typeof fetch }): BacklogProvider {
  const doFetch = opts.fetch ?? fetch;
  const base = `${API}/repos/${encodeURIComponent(opts.owner)}/${encodeURIComponent(opts.repo)}`;

  async function call(pathOrUrl: string, init: { method?: string; body?: unknown } = {}) {
    let res: Response;
    try {
      res = await doFetch(pathOrUrl.startsWith(`${API}/`) ? pathOrUrl : `${base}${pathOrUrl}`, {
        method: init.method ?? "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${opts.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch {
      throw new BacklogOffline("GitHub injoignable : la modification attend d'être envoyée.");
    }
    if (!res.ok) throw new BacklogHttpError(res.status, httpMessage(res.status));
    const data: unknown = res.status === 204 ? null : await res.json();
    return { data, link: res.headers.get("link") };
  }

  const issuePath = (id: string) => {
    if (!/^\d+$/.test(id)) throw new BacklogHttpError(400, "Identifiant d'issue invalide.");
    return `/issues/${id}`;
  };

  return {
    async list() {
      const items: BacklogItem[] = [];
      let url: string | null = `${base}/issues?state=all&per_page=${PER_PAGE}&sort=updated&direction=desc`;
      for (let page = 0; url && page < MAX_PAGES; page++) {
        const { data, link } = await call(url);
        for (const issue of z.array(Issue).parse(data)) if (!issue.pull_request) items.push(toItem(issue));
        url = nextPage(link);
      }
      return items;
    },

    async create(item) {
      const { data } = await call("/issues", {
        method: "POST",
        body: { title: item.title.trim(), body: item.description, labels: labelsFor(item) },
      });
      return toItem(Issue.parse(data));
    },

    async setStatus(id, status) {
      // Read first so labels added on GitHub since the last sync are kept.
      const current = Issue.parse((await call(issuePath(id))).data);
      const { data } = await call(issuePath(id), {
        method: "PATCH",
        body: {
          state: status === "done" ? "closed" : "open",
          ...(status === "done" ? { state_reason: "completed" } : {}),
          labels: withStatus(current.labels.map(labelName), status),
        },
      });
      return toItem(Issue.parse(data));
    },

    async comment(id, body) {
      await call(`${issuePath(id)}/comments`, { method: "POST", body: { body } });
    },
  };
}
