/**
 * Pure schedule/adherence maths for treatments. Missed doses are never stored:
 * they are scheduled days with no check-off, so they stay visible in history
 * until the user logs them late or marks them skipped.
 */
import { addDays, today as localDay } from "./dates.ts";
import { isScheduled, regimenOn, type Dose, type Regimen } from "./stock.ts";

export type DayStatus =
  | "taken" // every expected dose taken
  | "partial" // some taken, some skipped or missing
  | "skipped" // marked as missed on purpose
  | "missed" // past day, nothing logged
  | "pending" // today, not logged yet
  | "off" // not scheduled that day
  | "before"; // before the first regimen

export type DayEntry = {
  day: string;
  expected: number;
  taken: number;
  skipped: number;
  status: DayStatus;
  late: boolean; // a dose was checked off on a later day
};

export function expectedOn(regimens: Regimen[], day: string): number {
  const r = regimenOn(regimens, day);
  return r && isScheduled(r, day) ? r.dosesPerDay : 0;
}

function entry(regimens: Regimen[], own: Dose[], day: string, today: string): DayEntry {
  const taken = own.filter((d) => d.status === "taken").length;
  const skipped = own.length - taken;
  const expected = expectedOn(regimens, day);
  const late = own.some((d) => localDay(new Date(d.takenAt)) > day);
  let status: DayStatus;
  if (!regimenOn(regimens, day)) status = "before";
  else if (expected === 0) status = taken > 0 ? "taken" : "off";
  else if (taken >= expected) status = "taken";
  else if (taken + skipped >= expected) status = taken > 0 ? "partial" : "skipped";
  else if (taken > 0) status = "partial";
  else if (skipped > 0) status = "skipped";
  else status = day >= today ? "pending" : "missed";
  return { day, expected, taken, skipped, status, late };
}

/** One entry per day, oldest first, for the `days` days ending today. */
export function history(regimens: Regimen[], doses: Dose[], today: string, days: number): DayEntry[] {
  const byDay = new Map<string, Dose[]>();
  for (const d of doses) {
    const list = byDay.get(d.day);
    if (list) list.push(d);
    else byDay.set(d.day, [d]);
  }
  const out: DayEntry[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    out.push(entry(regimens, byDay.get(day) ?? [], day, today));
  }
  return out;
}

/**
 * Share of expected doses taken over the last `days` days. Today only counts
 * once logged, so a dose not taken yet this morning is not a miss.
 * `ratio` is null when nothing was expected (e.g. "as needed").
 */
export function adherence(
  regimens: Regimen[],
  doses: Dose[],
  today: string,
  days: number,
): { expected: number; taken: number; ratio: number | null; takenCount: number } {
  let expected = 0;
  let taken = 0;
  let takenCount = 0;
  for (const e of history(regimens, doses, today, days)) {
    takenCount += e.taken;
    if (e.status === "before") continue;
    if (e.day === today && e.taken + e.skipped < e.expected) {
      expected += e.taken + e.skipped;
      taken += e.taken;
    } else {
      expected += e.expected;
      taken += Math.min(e.taken, e.expected);
    }
  }
  return { expected, taken, ratio: expected > 0 ? taken / expected : null, takenCount };
}
