import { Linking } from "react-native";
import type { SQLiteDatabase } from "expo-sqlite";
import { atLocalTime, diffDays, shortFrDate, today } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { CHANNEL_MONEY, cancelScheduled, scheduleAt } from "@/lib/notifications";
import { monthlyCents, nextRenewals, type Cycle, type CycleUnit } from "@/lib/renewals";

export const SUBSCRIPTION_CATEGORIES = [
  "streaming",
  "musique",
  "logiciel",
  "cloud",
  "jeux",
  "presse",
  "sport",
  "telephonie",
  "autre",
] as const;
export type SubscriptionCategory = (typeof SUBSCRIPTION_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<SubscriptionCategory, string> = {
  streaming: "Streaming",
  musique: "Musique",
  logiciel: "Logiciel",
  cloud: "Cloud",
  jeux: "Jeux",
  presse: "Presse",
  sport: "Sport",
  telephonie: "Téléphonie",
  autre: "Autre",
};

/** Android cannot cancel another app's subscription: this opens Google Play's own page. */
export const PLAY_SUBSCRIPTIONS_URL = "https://play.google.com/store/account/subscriptions";

export type Billing = "google_play" | "direct";

export type Subscription = {
  id: number;
  name: string;
  category: SubscriptionCategory;
  priceCents: number;
  cycle: Cycle;
  anchorOn: string;
  trialEndsOn: string | null;
  reminderDays: number;
  billing: Billing;
  cancelUrl: string | null;
  notes: string | null;
  status: "active" | "cancelled";
  cancelledOn: string | null;
};

export type SubscriptionState = Subscription & {
  nextOn: string; // next billing date, today included
  daysUntil: number;
  monthlyCents: number;
  trialDaysLeft: number | null; // null when no trial is running
};

export type SubscriptionInput = Omit<Subscription, "id" | "status" | "cancelledOn">;

type Row = {
  id: number;
  name: string;
  category: string;
  price_cents: number;
  cycle_unit: CycleUnit;
  cycle_count: number;
  anchor_on: string;
  trial_ends_on: string | null;
  reminder_days: number;
  billing: Billing;
  cancel_url: string | null;
  notes: string | null;
  status: "active" | "cancelled";
  cancelled_on: string | null;
};

const REMINDER_HOUR = 9;
const SCHEDULED_RENEWALS = 3;

export async function loadSubscriptions(db: SQLiteDatabase, day = today()): Promise<SubscriptionState[]> {
  const rows = await db.getAllAsync<Row>("SELECT * FROM subscriptions");
  return rows
    .map((r) => {
      const cycle: Cycle = { unit: r.cycle_unit, count: r.cycle_count };
      const nextOn = nextRenewals(r.anchor_on, cycle, day)[0];
      const category = (SUBSCRIPTION_CATEGORIES as readonly string[]).includes(r.category)
        ? (r.category as SubscriptionCategory)
        : "autre";
      return {
        id: r.id,
        name: r.name,
        category,
        priceCents: r.price_cents,
        cycle,
        anchorOn: r.anchor_on,
        trialEndsOn: r.trial_ends_on,
        reminderDays: r.reminder_days,
        billing: r.billing,
        cancelUrl: r.cancel_url,
        notes: r.notes,
        status: r.status,
        cancelledOn: r.cancelled_on,
        nextOn,
        daysUntil: diffDays(day, nextOn),
        monthlyCents: monthlyCents(r.price_cents, cycle),
        trialDaysLeft: r.trial_ends_on && r.trial_ends_on >= day ? diffDays(day, r.trial_ends_on) : null,
      };
    })
    .sort((a, b) => a.nextOn.localeCompare(b.nextOn) || a.name.localeCompare(b.name));
}

/** Loads subscriptions and reschedules every reminder (renewals and trial ends). */
export async function refreshSubscriptions(db: SQLiteDatabase): Promise<SubscriptionState[]> {
  const subs = await loadSubscriptions(db);
  await Promise.all(subs.map(syncReminders)).catch(console.warn);
  return subs;
}

const reminderIds = (id: number) => [...Array.from({ length: SCHEDULED_RENEWALS }, (_, k) => `sub-${id}-r${k}`), `sub-${id}-trial`];

/**
 * The next three renewals each get a one-shot reminder `reminderDays` before;
 * the list moves forward every time the app loads subscriptions.
 */
async function syncReminders(s: SubscriptionState) {
  if (s.status !== "active") {
    await cancelScheduled(reminderIds(s.id));
    return;
  }
  const dates = nextRenewals(s.anchorOn, s.cycle, today(), SCHEDULED_RENEWALS);
  for (const [k, date] of dates.entries()) {
    const at = atLocalTime(date, REMINDER_HOUR);
    at.setDate(at.getDate() - s.reminderDays);
    await scheduleAt(`sub-${s.id}-r${k}`, `💳 ${s.name}`, `Prélèvement de ${formatCents(s.priceCents)} le ${shortFrDate(date)}.`, at, CHANNEL_MONEY);
  }
  if (s.trialEndsOn) {
    const at = atLocalTime(s.trialEndsOn, REMINDER_HOUR);
    at.setDate(at.getDate() - s.reminderDays);
    await scheduleAt(`sub-${s.id}-trial`, `⏳ Essai ${s.name}`, `L'essai se termine le ${shortFrDate(s.trialEndsOn)}.`, at, CHANNEL_MONEY);
  } else {
    await cancelScheduled([`sub-${s.id}-trial`]);
  }
}

export async function saveSubscription(db: SQLiteDatabase, input: SubscriptionInput, id?: number): Promise<number> {
  const fields = [
    input.name.trim(),
    input.category,
    input.priceCents,
    input.cycle.unit,
    input.cycle.count,
    input.anchorOn,
    input.trialEndsOn,
    input.reminderDays,
    input.billing,
    input.cancelUrl?.trim() || null,
    input.notes?.trim() || null,
  ];
  if (id === undefined) {
    const res = await db.runAsync(
      `INSERT INTO subscriptions (name, category, price_cents, cycle_unit, cycle_count, anchor_on, trial_ends_on,
         reminder_days, billing, cancel_url, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ...fields,
    );
    return res.lastInsertRowId;
  }
  await db.runAsync(
    `UPDATE subscriptions SET name = ?, category = ?, price_cents = ?, cycle_unit = ?, cycle_count = ?, anchor_on = ?,
       trial_ends_on = ?, reminder_days = ?, billing = ?, cancel_url = ?, notes = ? WHERE id = ?`,
    ...fields,
    id,
  );
  return id;
}

export async function setSubscriptionStatus(db: SQLiteDatabase, id: number, status: "active" | "cancelled") {
  await db.runAsync(
    "UPDATE subscriptions SET status = ?, cancelled_on = ? WHERE id = ?",
    status,
    status === "cancelled" ? today() : null,
    id,
  );
  if (status === "cancelled") await cancelScheduled(reminderIds(id));
}

export async function deleteSubscription(db: SQLiteDatabase, id: number) {
  await db.runAsync("DELETE FROM subscriptions WHERE id = ?", id);
  await cancelScheduled(reminderIds(id));
}

/** Google Play's subscription centre, or the service's own cancellation page. */
export function cancellationUrl(s: Pick<Subscription, "billing" | "cancelUrl">): string | null {
  return s.billing === "google_play" ? PLAY_SUBSCRIPTIONS_URL : s.cancelUrl;
}

export async function openCancellation(s: Pick<Subscription, "billing" | "cancelUrl">): Promise<boolean> {
  const url = cancellationUrl(s);
  if (!url) return false;
  await Linking.openURL(url);
  return true;
}

export type MoneyAlert = { key: string; text: string; tone: "warning" | "info"; href: "/plus/abonnements" | "/plus/wishlist" };

const inDays = (n: number) => (n === 0 ? "aujourd'hui" : n === 1 ? "demain" : `dans ${n} j`);

/** Renewals and trial ends inside their reminder window; shown in Today too. */
export function subscriptionAlerts(subs: SubscriptionState[]): MoneyAlert[] {
  const alerts: MoneyAlert[] = [];
  for (const s of subs) {
    if (s.status !== "active") continue;
    if (s.trialDaysLeft !== null && s.trialDaysLeft <= s.reminderDays) {
      alerts.push({
        key: `trial-${s.id}`,
        tone: "warning",
        text: `Essai ${s.name} : se termine ${inDays(s.trialDaysLeft)}`,
        href: "/plus/abonnements",
      });
    } else if (s.daysUntil <= s.reminderDays) {
      alerts.push({
        key: `renew-${s.id}`,
        tone: "info",
        text: `${s.name} : ${formatCents(s.priceCents)} ${inDays(s.daysUntil)} (${shortFrDate(s.nextOn)})`,
        href: "/plus/abonnements",
      });
    }
  }
  return alerts;
}
