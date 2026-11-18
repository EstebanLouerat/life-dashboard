import type { SQLiteDatabase } from "expo-sqlite";
import { addDays, atLocalTime, today } from "@/lib/dates";
import { CHANNEL_MONEY, cancelScheduled, scheduleAt, scheduleMonthly } from "@/lib/notifications";
import {
  coolingDaysLeft,
  fundingPlan,
  monthlySaved,
  monthOf,
  type Balance,
  type Funding,
  type Priority,
} from "@/lib/savings";
import type { MoneyAlert } from "@/lib/subscriptions";

export const DEFAULT_WISH_CATEGORIES = ["Lifestyle", "Setup", "Tech", "Maison", "Vêtements", "Loisirs"];

export const PRIORITY_LABEL: Record<Priority, string> = { 1: "Envie", 2: "Important", 3: "Essentiel" };

export type WishStatus = "wanted" | "bought" | "dropped";

export type WishItem = {
  id: number;
  name: string;
  category: string;
  priceCents: number;
  priority: Priority;
  url: string | null;
  notes: string | null;
  status: WishStatus;
  coolingUntil: string | null;
  addedOn: string;
  closedOn: string | null;
  paidCents: number | null;
};

export type WishlistSettings = { monthlyGoalCents: number; coolingDays: number };

export type WishlistState = {
  items: WishItem[];
  categories: string[];
  settings: WishlistSettings;
  balances: Balance[]; // oldest first
  balanceCents: number | null; // latest balance entered
  monthRecorded: boolean; // balance entered for the current month
  savedThisMonthCents: number | null;
  plan: Map<number, Funding>;
};

export type WishInput = Pick<WishItem, "name" | "category" | "priceCents" | "priority" | "url" | "notes"> & {
  cooling: boolean; // new items only: start a cooling-off period
};

type Row = {
  id: number;
  name: string;
  category: string;
  price_cents: number;
  priority: number;
  url: string | null;
  notes: string | null;
  status: WishStatus;
  cooling_until: string | null;
  added_on: string;
  closed_on: string | null;
  paid_cents: number | null;
};

const REMINDER_HOUR = 9;
const BALANCE_REMINDER_ID = "savings-balance";

export async function loadWishlist(db: SQLiteDatabase, day = today()): Promise<WishlistState> {
  const rows = await db.getAllAsync<Row>("SELECT * FROM wishlist_items ORDER BY added_on DESC, id DESC");
  const items: WishItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    priceCents: r.price_cents,
    priority: (Math.min(3, Math.max(1, r.priority)) as Priority),
    url: r.url,
    notes: r.notes,
    status: r.status,
    coolingUntil: r.cooling_until,
    addedOn: r.added_on,
    closedOn: r.closed_on,
    paidCents: r.paid_cents,
  }));
  const settingsRows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM settings WHERE key IN ('wishlist_monthly_goal_cents', 'wishlist_cooling_days')",
  );
  const s = Object.fromEntries(settingsRows.map((r) => [r.key, Number(r.value)]));
  const settings: WishlistSettings = {
    monthlyGoalCents: s.wishlist_monthly_goal_cents || 0,
    coolingDays: s.wishlist_cooling_days ?? 30,
  };
  const balances = (
    await db.getAllAsync<{ month: string; balance_cents: number }>("SELECT month, balance_cents FROM savings_balances ORDER BY month")
  ).map((b) => ({ month: b.month, balanceCents: b.balance_cents }));
  const latest = balances[balances.length - 1];
  const month = monthOf(day);
  const thisMonth = monthlySaved(balances).find((m) => m.month === month);
  const wanted = items.filter((i) => i.status === "wanted");
  const categories = [...new Set([...DEFAULT_WISH_CATEGORIES, ...items.map((i) => i.category)])];
  return {
    items,
    categories,
    settings,
    balances,
    balanceCents: latest?.balanceCents ?? null,
    monthRecorded: latest?.month === month,
    savedThisMonthCents: thisMonth?.savedCents ?? null,
    plan: fundingPlan(wanted, latest?.balanceCents ?? 0, settings.monthlyGoalCents),
  };
}

/** Loads the wishlist and reschedules cooling-off ends and the monthly balance reminder. */
export async function refreshWishlist(db: SQLiteDatabase): Promise<WishlistState> {
  const state = await loadWishlist(db);
  const day = today();
  const jobs = state.items.map((i) =>
    i.status === "wanted" && i.coolingUntil && i.coolingUntil > day
      ? scheduleAt(
          `wish-${i.id}-cooling`,
          `🎁 ${i.name}`,
          "Fin de la période de réflexion. Toujours envie ?",
          atLocalTime(i.coolingUntil, REMINDER_HOUR),
          CHANNEL_MONEY,
        )
      : cancelScheduled([`wish-${i.id}-cooling`]),
  );
  if (tracksSavings(state)) {
    jobs.push(scheduleMonthly(BALANCE_REMINDER_ID, "💰 Épargne", "Nouveau mois : saisis ton solde d'épargne.", 1, REMINDER_HOUR, 0, CHANNEL_MONEY));
  }
  await Promise.all(jobs).catch(console.warn);
  return state;
}

/** Savings features are on once a balance or a monthly goal exists. */
export function tracksSavings(state: WishlistState): boolean {
  return state.balances.length > 0 || state.settings.monthlyGoalCents > 0;
}

export async function saveWish(db: SQLiteDatabase, input: WishInput, coolingDays: number, id?: number): Promise<number> {
  const fields = [input.name.trim(), input.category.trim(), input.priceCents, input.priority, input.url?.trim() || null, input.notes?.trim() || null];
  if (id === undefined) {
    const day = today();
    const res = await db.runAsync(
      `INSERT INTO wishlist_items (name, category, price_cents, priority, url, notes, cooling_until, added_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ...fields,
      input.cooling && coolingDays > 0 ? addDays(day, coolingDays) : null,
      day,
    );
    return res.lastInsertRowId;
  }
  await db.runAsync(
    "UPDATE wishlist_items SET name = ?, category = ?, price_cents = ?, priority = ?, url = ?, notes = ? WHERE id = ?",
    ...fields,
    id,
  );
  return id;
}

export async function setWishStatus(db: SQLiteDatabase, id: number, status: WishStatus, paidCents?: number) {
  await db.runAsync(
    "UPDATE wishlist_items SET status = ?, closed_on = ?, paid_cents = ? WHERE id = ?",
    status,
    status === "wanted" ? null : today(),
    status === "bought" ? (paidCents ?? null) : null,
    id,
  );
  if (status !== "wanted") await cancelScheduled([`wish-${id}-cooling`]);
}

/** Ends the cooling-off period early (the user decided). */
export async function endCooling(db: SQLiteDatabase, id: number) {
  await db.runAsync("UPDATE wishlist_items SET cooling_until = NULL WHERE id = ?", id);
  await cancelScheduled([`wish-${id}-cooling`]);
}

export async function deleteWish(db: SQLiteDatabase, id: number) {
  await db.runAsync("DELETE FROM wishlist_items WHERE id = ?", id);
  await cancelScheduled([`wish-${id}-cooling`]);
}

export async function saveBalance(db: SQLiteDatabase, month: string, balanceCents: number) {
  await db.runAsync(
    "INSERT OR REPLACE INTO savings_balances (month, balance_cents, recorded_at) VALUES (?, ?, ?)",
    month,
    balanceCents,
    new Date().toISOString(),
  );
}

export async function saveWishlistSettings(db: SQLiteDatabase, settings: WishlistSettings) {
  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('wishlist_monthly_goal_cents', ?), ('wishlist_cooling_days', ?)",
    String(settings.monthlyGoalCents),
    String(settings.coolingDays),
  );
}

export function coolingLeft(item: WishItem, day = today()): number {
  return coolingDaysLeft(item.coolingUntil, day);
}

/** Missing monthly balance and cooling-off periods that just ended; shown in Today. */
export function wishlistAlerts(state: WishlistState, day = today()): MoneyAlert[] {
  const alerts: MoneyAlert[] = [];
  if (tracksSavings(state) && !state.monthRecorded) {
    const label = new Date(`${monthOf(day)}-15T12:00:00`).toLocaleDateString("fr-FR", { month: "long" });
    alerts.push({ key: "balance", tone: "info", text: `Solde d'épargne de ${label} à saisir`, href: "/plus/wishlist" });
  }
  for (const i of state.items) {
    if (i.status === "wanted" && i.coolingUntil && i.coolingUntil <= day && i.coolingUntil >= addDays(day, -6)) {
      alerts.push({ key: `cool-${i.id}`, tone: "info", text: `Réflexion terminée : ${i.name}. Toujours envie ?`, href: "/plus/wishlist" });
    }
  }
  return alerts;
}
