import type { SQLiteDatabase } from "expo-sqlite";
import { secrets } from "@/lib/secrets";
import type { BacklogItem, BacklogProvider, BacklogStatus, NewBacklogItem } from "@ld/contracts";
import { BacklogOffline, githubProvider, parseRepo } from "@/lib/backlogGithub";

/**
 * Backlog on the phone: a local copy of the issues for offline reading, and
 * an outbox for changes made without network (sent oldest first at the next
 * sync). The provider is GitHub today; screens only see BacklogItem.
 * The token sits in SecureStore (lib/secrets), never in SQLite, a log or an error.
 */

const TOKEN_KEY = "backlog_github_token";

/** Modules an idea or a bug can be filed under (label `module:<value>`). */
export const BACKLOG_MODULES: { value: string; label: string }[] = [
  { value: "today", label: "Aujourd'hui" },
  { value: "sante", label: "Santé" },
  { value: "hair-care", label: "Cheveux (ancien)" },
  { value: "courses", label: "Courses" },
  { value: "sport", label: "Sport" },
  { value: "abonnements", label: "Abonnements" },
  { value: "wishlist", label: "Wishlist" },
  { value: "apartments", label: "Appartement" },
  { value: "importer", label: "Importer" },
  { value: "backlog", label: "Backlog" },
  { value: "reglages", label: "Réglages" },
];

export const moduleLabel = (value: string | null) =>
  value ? (BACKLOG_MODULES.find((m) => m.value === value)?.label ?? value) : "Général";

/** Module of the screen a capture was opened from ("/" → today, "/plus/wishlist" → wishlist). */
export function moduleFromPath(path: string | undefined): string | null {
  if (!path || path === "/" || path === "/personnaliser") return path ? "today" : null;
  const name = /^\/(?:modules\/|plus\/)?([\w-]+)/.exec(path)?.[1] ?? null;
  return name && BACKLOG_MODULES.some((m) => m.value === name) ? name : null;
}

type Outgoing =
  | { kind: "create"; payload: NewBacklogItem }
  | { kind: "status"; payload: { id: string; status: BacklogStatus; title: string } }
  | { kind: "comment"; payload: { id: string; body: string } };

export type PendingChange = Outgoing & { outboxId: number; error: string | null };

export type BacklogState = {
  configured: boolean;
  items: BacklogItem[];
  pending: PendingChange[];
  syncedAt: string | null;
  /** Last sync failure, safe to show. */
  error: string | null;
  offline: boolean;
};

export async function getBacklogConfig(db: SQLiteDatabase): Promise<{ repo: string; hasToken: boolean }> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'backlog_repo'");
  const token = await secrets.get(TOKEN_KEY);
  return { repo: row?.value ?? "", hasToken: !!token };
}

/** Saves the repository; a blank token keeps the stored one. */
export async function saveBacklogConfig(db: SQLiteDatabase, repo: string, token: string): Promise<void> {
  await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('backlog_repo', ?)", repo.trim());
  if (token.trim()) await secrets.set(TOKEN_KEY, token.trim());
}

async function provider(db: SQLiteDatabase): Promise<BacklogProvider | null> {
  const { repo } = await getBacklogConfig(db);
  const parsed = parseRepo(repo);
  const token = await secrets.get(TOKEN_KEY);
  return parsed && token ? githubProvider({ ...parsed, token }) : null;
}

type ItemRow = {
  id: string;
  title: string;
  description: string;
  status: BacklogStatus;
  kind: BacklogItem["kind"];
  module: string | null;
  labels_json: string;
  url: string;
  updated_at: string;
};

const toItem = (r: ItemRow): BacklogItem => ({
  id: r.id,
  title: r.title,
  description: r.description,
  status: r.status,
  kind: r.kind,
  module: r.module,
  labels: JSON.parse(r.labels_json) as string[],
  url: r.url,
  updatedAt: r.updated_at,
});

async function cacheItem(db: SQLiteDatabase, item: BacklogItem) {
  await db.runAsync(
    `INSERT OR REPLACE INTO backlog_items (id, title, description, status, kind, module, labels_json, url, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    item.id,
    item.title,
    item.description,
    item.status,
    item.kind,
    item.module,
    JSON.stringify(item.labels),
    item.url,
    item.updatedAt,
  );
}

/** The local copy, with queued status changes already applied. No network. */
export async function loadBacklog(db: SQLiteDatabase, extra: { error?: string | null; offline?: boolean } = {}): Promise<BacklogState> {
  const [{ repo, hasToken }, rows, outbox, synced] = await Promise.all([
    getBacklogConfig(db),
    db.getAllAsync<ItemRow>("SELECT * FROM backlog_items ORDER BY updated_at DESC"),
    db.getAllAsync<{ id: number; kind: Outgoing["kind"]; payload_json: string; last_error: string | null }>(
      "SELECT id, kind, payload_json, last_error FROM backlog_outbox ORDER BY id",
    ),
    db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'backlog_synced_at'"),
  ]);
  const pending = outbox.map((o) => ({ kind: o.kind, payload: JSON.parse(o.payload_json), outboxId: o.id, error: o.last_error }) as PendingChange);
  const items = rows.map(toItem).map((item) => {
    const queued = pending.filter((p) => p.kind === "status" && p.payload.id === item.id).pop();
    return queued && queued.kind === "status" ? { ...item, status: queued.payload.status } : item;
  });
  return {
    configured: !!parseRepo(repo) && hasToken,
    items,
    pending,
    syncedAt: synced?.value || null,
    error: extra.error ?? null,
    offline: extra.offline ?? false,
  };
}

/**
 * Sends the outbox (oldest first). Stops at the first network failure, so
 * order is kept; a change GitHub refuses stays with its error, for the user
 * to drop. Returns whether the network was reachable.
 */
async function flush(db: SQLiteDatabase, p: BacklogProvider): Promise<boolean> {
  const rows = await db.getAllAsync<{ id: number; kind: Outgoing["kind"]; payload_json: string }>(
    "SELECT id, kind, payload_json FROM backlog_outbox ORDER BY id",
  );
  for (const row of rows) {
    const change = { kind: row.kind, payload: JSON.parse(row.payload_json) } as Outgoing;
    try {
      if (change.kind === "create") await cacheItem(db, await p.create(change.payload));
      else if (change.kind === "status") await cacheItem(db, await p.setStatus(change.payload.id, change.payload.status));
      else await p.comment(change.payload.id, change.payload.body);
      await db.runAsync("DELETE FROM backlog_outbox WHERE id = ?", row.id);
    } catch (e) {
      if (e instanceof BacklogOffline) return false;
      await db.runAsync(
        "UPDATE backlog_outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?",
        e instanceof Error ? e.message : "Erreur inconnue.",
        row.id,
      );
    }
  }
  return true;
}

/** Sends pending changes, then refreshes the local copy from the provider. */
export async function syncBacklog(db: SQLiteDatabase): Promise<BacklogState> {
  const p = await provider(db);
  if (!p) return loadBacklog(db);
  try {
    if (!(await flush(db, p))) return loadBacklog(db, { offline: true });
    const items = await p.list();
    await db.withTransactionAsync(async () => {
      await db.runAsync("DELETE FROM backlog_items");
      for (const item of items) await cacheItem(db, item);
      await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('backlog_synced_at', ?)", new Date().toISOString());
    });
    return loadBacklog(db);
  } catch (e) {
    if (e instanceof BacklogOffline) return loadBacklog(db, { offline: true });
    return loadBacklog(db, { error: e instanceof Error ? e.message : String(e) });
  }
}

async function enqueue(db: SQLiteDatabase, change: Outgoing): Promise<"sent" | "queued"> {
  await db.runAsync("INSERT INTO backlog_outbox (kind, payload_json) VALUES (?, ?)", change.kind, JSON.stringify(change.payload));
  const p = await provider(db);
  if (!p) return "queued";
  const online = await flush(db, p).catch(() => false);
  const left = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM backlog_outbox");
  return online && !left?.n ? "sent" : "queued";
}

/** Files an idea or a bug; without network (or before setup) it waits in the outbox. */
export function captureItem(db: SQLiteDatabase, item: NewBacklogItem): Promise<"sent" | "queued"> {
  return enqueue(db, { kind: "create", payload: item });
}

/** One-tap status change: shown at once through the outbox, sent when possible. */
export function changeStatus(db: SQLiteDatabase, item: BacklogItem, status: BacklogStatus): Promise<"sent" | "queued"> {
  return enqueue(db, { kind: "status", payload: { id: item.id, status, title: item.title } });
}

export async function dropPending(db: SQLiteDatabase, outboxId: number): Promise<void> {
  await db.runAsync("DELETE FROM backlog_outbox WHERE id = ?", outboxId);
}
