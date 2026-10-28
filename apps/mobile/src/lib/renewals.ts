/**
 * Pure billing-cycle maths for subscriptions. Only the first billing date
 * (anchor) is stored; every renewal is derived from it, so nothing needs to
 * be rewritten when a date passes.
 */
import { addDays, diffDays } from "./dates.ts";

export type CycleUnit = "week" | "month" | "year";
export type Cycle = { unit: CycleUnit; count: number };

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The k-th billing date after the anchor. Months are counted from the anchor
 * each time and clamped to the month's last day: 31 Jan → 28 Feb → 31 Mar.
 */
export function occurrence(anchor: string, cycle: Cycle, k: number): string {
  if (cycle.unit === "week") return addDays(anchor, 7 * cycle.count * k);
  const [y, m, d] = anchor.split("-").map(Number);
  const total = m - 1 + (cycle.unit === "year" ? 12 : 1) * cycle.count * k;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(d, lastDay))}`;
}

/** The next `n` billing dates on or after `from`. */
export function nextRenewals(anchor: string, cycle: Cycle, from: string, n = 1): string[] {
  let k = 0;
  if (anchor < from) {
    // Lower bound using the longest possible cycle, then step forward.
    const longest = cycle.unit === "week" ? 7 : cycle.unit === "month" ? 31 : 366;
    k = Math.max(0, Math.floor(diffDays(anchor, from) / (longest * cycle.count)));
    while (occurrence(anchor, cycle, k) < from) k++;
  }
  return Array.from({ length: n }, (_, i) => occurrence(anchor, cycle, k + i));
}

/** Average cost per month, in cents (not rounded). */
export function monthlyCents(priceCents: number, cycle: Cycle): number {
  if (cycle.unit === "week") return (priceCents * 52) / 12 / cycle.count;
  if (cycle.unit === "month") return priceCents / cycle.count;
  return priceCents / (12 * cycle.count);
}

export function cycleLabel(cycle: Cycle): string {
  const { unit, count } = cycle;
  if (count === 1) return unit === "week" ? "par semaine" : unit === "month" ? "par mois" : "par an";
  if (unit === "week") return `toutes les ${count} semaines`;
  return unit === "month" ? `tous les ${count} mois` : `tous les ${count} ans`;
}
