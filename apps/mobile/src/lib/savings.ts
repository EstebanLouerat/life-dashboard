/**
 * Pure maths for the wishlist: how current savings and the monthly savings
 * goal fund the wanted items, and how long each item still has to "cool off".
 */
import { diffDays } from "./dates.ts";

export type Priority = 1 | 2 | 3; // 1 envie, 2 important, 3 essentiel

export type WishFunding = {
  id: number;
  priceCents: number;
  priority: Priority;
  addedOn: string; // YYYY-MM-DD
};

export type Funding = {
  fundedCents: number; // part already covered by current savings
  monthsToGo: number | null; // 0 = affordable now, null = no monthly goal set
};

/** Highest priority first, then the oldest wish. */
export function fundingOrder<T extends WishFunding>(items: T[]): T[] {
  return [...items].sort((a, b) => b.priority - a.priority || a.addedOn.localeCompare(b.addedOn) || a.id - b.id);
}

/**
 * Waterfall: savings go to items in funding order. An item that is not fully
 * covered waits until the monthly goal has paid for its shortfall and the
 * shortfall of every item before it.
 */
export function fundingPlan(items: WishFunding[], balanceCents: number, monthlyGoalCents: number): Map<number, Funding> {
  const plan = new Map<number, Funding>();
  let left = Math.max(0, balanceCents);
  let shortfall = 0;
  for (const item of fundingOrder(items)) {
    const funded = Math.min(left, item.priceCents);
    left -= funded;
    shortfall += item.priceCents - funded;
    const covered = funded === item.priceCents;
    plan.set(item.id, {
      fundedCents: funded,
      monthsToGo: covered ? 0 : monthlyGoalCents > 0 ? Math.ceil(shortfall / monthlyGoalCents) : null,
    });
  }
  return plan;
}

/** Days left before an item may be bought (0 = free to decide). */
export function coolingDaysLeft(coolingUntil: string | null, today: string): number {
  return coolingUntil ? Math.max(0, diffDays(today, coolingUntil)) : 0;
}

export type Balance = { month: string; balanceCents: number }; // month: YYYY-MM

/** Amount saved per recorded month: difference with the previous record. */
export function monthlySaved(balances: Balance[]): { month: string; savedCents: number }[] {
  const sorted = [...balances].sort((a, b) => a.month.localeCompare(b.month));
  return sorted.slice(1).map((b, i) => ({ month: b.month, savedCents: b.balanceCents - sorted[i].balanceCents }));
}

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
