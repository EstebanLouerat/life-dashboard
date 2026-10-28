/**
 * Pure stock maths for treatments. No React, no SQLite: run with `npm test`.
 * Imports stay relative with a .ts extension so Node can run the tests as-is.
 */
import { addDays, atLocalTime, diffDays, isoWeekday } from "./dates.ts";

export type Frequency = "daily" | "weekdays" | "as_needed";

/** Dosage in force from `effectiveFrom` until the next regimen. */
export type Regimen = {
  effectiveFrom: string; // YYYY-MM-DD
  doseQty: number; // per intake: 1 tablet, 2 ml
  dosesPerDay: number;
  frequency: Frequency;
  weekdays: number[]; // ISO 1 = Monday … 7 = Sunday, only for "weekdays"
};

export type DoseStatus = "taken" | "skipped";

/** An active (not undone) check-off. */
export type Dose = {
  day: string; // day the dose counts for
  slot: number;
  qty: number; // dose at the time of logging, 0 when skipped
  status: DoseStatus;
  takenAt: string; // ISO time of the tap
};

/** "add": a box/bottle on top of the current stock. "set": stock counted (or old one finished). */
export type StockEvent = { kind: "add" | "set"; qty: number; at: string };

export type RateSource = "real" | "planned";

export const REAL_RATE_WINDOW_DAYS = 14;

export function regimenOn(regimens: Regimen[], day: string): Regimen | null {
  let found: Regimen | null = null;
  for (const r of regimens) {
    if (r.effectiveFrom <= day && (!found || r.effectiveFrom >= found.effectiveFrom)) found = r;
  }
  return found;
}

export function isScheduled(regimen: Regimen | null, day: string): boolean {
  if (!regimen) return false;
  if (regimen.frequency === "daily") return true;
  if (regimen.frequency === "weekdays") return regimen.weekdays.includes(isoWeekday(day));
  return false;
}

/** Planned consumption per day, or null for "as needed". */
export function plannedDailyRate(regimen: Regimen): number | null {
  const perDay = regimen.doseQty * regimen.dosesPerDay;
  if (regimen.frequency === "daily") return perDay;
  if (regimen.frequency === "weekdays") return (perDay * regimen.weekdays.length) / 7;
  return null;
}

/**
 * When a check-off moved the stock. A dose logged late (yesterday's, tapped
 * today) counts at the end of its own day, so a stock count made in between
 * does not subtract it a second time.
 */
export function doseEffectiveAt(dose: Dose): number {
  const endOfDay = atLocalTime(dose.day, 23, 59, 59, 999).getTime();
  return Math.min(Date.parse(dose.takenAt), endOfDay);
}

/**
 * Remaining quantity from logged events only, never from a start date:
 * last count ("set", or the first "add" if nothing was ever counted)
 * + later additions − taken doses after it. null if stock was never entered.
 */
export function remainingStock(events: StockEvent[], doses: Dose[]): number | null {
  if (events.length === 0) return null;
  const sorted = events
    .map((e) => ({ ...e, t: Date.parse(e.at) }))
    .sort((a, b) => a.t - b.t);
  let base = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].kind === "set") {
      base = i;
      break;
    }
  }
  const baselineAt = sorted[base].t;
  let remaining = sorted[base].qty;
  for (const e of sorted.slice(base + 1)) remaining += e.qty;
  for (const d of doses) {
    if (d.status === "taken" && doseEffectiveAt(d) > baselineAt) remaining -= d.qty;
  }
  return remaining;
}

/**
 * Average real consumption over the last 14 full days (today excluded). The
 * window never reaches before the current regimen or the first check-off;
 * when that leaves fewer than 14 days, the planned rate is used instead.
 */
export function dailyRate(
  regimens: Regimen[],
  doses: Dose[],
  today: string,
): { rate: number; source: RateSource } | null {
  const current = regimenOn(regimens, today);
  if (!current) return null;
  const end = addDays(today, -1);
  let start = addDays(today, -REAL_RATE_WINDOW_DAYS);
  if (current.effectiveFrom > start) start = current.effectiveFrom;
  const firstLogged = doses.reduce<string | null>((min, d) => (min === null || d.day < min ? d.day : min), null);
  if (firstLogged !== null) {
    if (firstLogged > start) start = firstLogged;
    if (diffDays(start, end) + 1 >= REAL_RATE_WINDOW_DAYS) {
      let total = 0;
      for (const d of doses) {
        if (d.status === "taken" && d.day >= start && d.day <= end) total += d.qty;
      }
      return { rate: total / REAL_RATE_WINDOW_DAYS, source: "real" };
    }
  }
  const planned = plannedDailyRate(current);
  return planned === null ? null : { rate: planned, source: "planned" };
}

export type Forecast = {
  remaining: number | null; // raw: quantity entered − doses logged
  usable: number | null; // remaining minus the waste margin
  rate: number | null;
  rateSource: RateSource | null;
  daysLeft: number | null;
  runOutOn: string | null;
  renewalAlertOn: string | null;
};

export function stockForecast(input: {
  regimens: Regimen[];
  doses: Dose[];
  stockEvents: StockEvent[];
  wastePct: number;
  renewalLeadDays: number;
  today: string;
}): Forecast {
  const remaining = remainingStock(input.stockEvents, input.doses);
  const usable = remaining === null ? null : Math.max(0, remaining) * (1 - input.wastePct);
  const r = dailyRate(input.regimens, input.doses, input.today);
  const daysLeft = usable !== null && r && r.rate > 0 ? usable / r.rate : null;
  const runOutOn = daysLeft === null ? null : addDays(input.today, Math.floor(daysLeft));
  return {
    remaining,
    usable,
    rate: r?.rate ?? null,
    rateSource: r?.source ?? null,
    daysLeft,
    runOutOn,
    renewalAlertOn: runOutOn === null ? null : addDays(runOutOn, -input.renewalLeadDays),
  };
}

/** Days one box/bottle lasts at the planned rate, after the waste margin. */
export function daysPerPackage(packageSize: number, wastePct: number, regimen: Regimen): number | null {
  const planned = plannedDailyRate(regimen);
  return planned ? (packageSize * (1 - wastePct)) / planned : null;
}

/** Splits a pooled stock into the opened unit (used first) and full units in reserve. */
export function supplySplit(remaining: number, packageSize: number): { opened: number; reserve: number } {
  if (remaining <= 0 || packageSize <= 0) return { opened: Math.max(0, remaining), reserve: 0 };
  const reserve = Math.ceil(remaining / packageSize - 1e-9) - 1;
  return { opened: remaining - reserve * packageSize, reserve };
}

/** Day a lead-time alert becomes due (e.g. prescription expiry − 10 days). */
export function leadDate(day: string, leadDays: number): string {
  return addDays(day, -leadDays);
}
