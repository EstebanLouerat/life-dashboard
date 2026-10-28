import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addDays, atLocalTime } from "./dates.ts";
import {
  dailyRate,
  daysPerPackage,
  remainingStock,
  stockForecast,
  supplySplit,
  type Dose,
  type Regimen,
  type StockEvent,
} from "./stock.ts";

const D0 = "2026-01-05";

const daily = (doseQty: number, effectiveFrom = D0): Regimen => ({
  effectiveFrom,
  doseQty,
  dosesPerDay: 1,
  frequency: "daily",
  weekdays: [],
});

const at = (day: string, hour: number, minute = 0) => atLocalTime(day, hour, minute).toISOString();

const taken = (day: string, qty: number, takenAt = at(day, 9)): Dose => ({ day, slot: 1, qty, status: "taken", takenAt });

/** One taken dose per day for `n` days starting at `from`. */
const everyDay = (from: string, n: number, qty: number): Dose[] =>
  Array.from({ length: n }, (_, i) => taken(addDays(from, i), qty));

const set = (qty: number, iso: string): StockEvent => ({ kind: "set", qty, at: iso });
const add = (qty: number, iso: string): StockEvent => ({ kind: "add", qty, at: iso });

describe("remainingStock", () => {
  it("is unknown until stock is entered", () => {
    assert.equal(remainingStock([], everyDay(D0, 3, 1)), null);
  });

  it("subtracts only taken doses logged after the count", () => {
    const doses = [
      taken(addDays(D0, -1), 1), // before the box: ignored
      ...everyDay(D0, 5, 1),
      { day: addDays(D0, 5), slot: 1, qty: 0, status: "skipped" as const, takenAt: at(addDays(D0, 5), 9) },
    ];
    assert.equal(remainingStock([set(80, at(D0, 8))], doses), 75);
  });

  it("does not subtract twice a dose logged late after a recount", () => {
    const today = addDays(D0, 1);
    const doses = [
      taken(D0, 1, at(today, 11)), // yesterday's dose, tapped today after the recount
      taken(today, 1, at(today, 12)),
    ];
    assert.equal(remainingStock([set(80, at(D0, 7)), set(50, at(today, 10))], doses), 49);
  });

  it("pools two bottles in use", () => {
    const doses = everyDay(D0, 17, 2);
    const remaining = remainingStock([set(60, at(D0, 8)), add(60, at(addDays(D0, 3), 18))], doses);
    assert.equal(remaining, 86);
    assert.deepEqual(supplySplit(86, 60), { opened: 26, reserve: 1 });
  });

  it("keeps the dose logged at the time when the dose changes mid-bottle", () => {
    const change = addDays(D0, 10);
    const doses = [...everyDay(D0, 10, 2), ...everyDay(change, 3, 1)];
    assert.equal(remainingStock([set(60, at(D0, 8))], doses), 60 - 20 - 3);
  });
});

describe("finasteride box of 80", () => {
  const regimens = [daily(1)];
  const forecastOn = (dayIndex: number) =>
    stockForecast({
      regimens,
      doses: everyDay(D0, dayIndex, 1),
      stockEvents: [set(80, at(D0, 8))],
      wastePct: 0,
      renewalLeadDays: 10,
      today: addDays(D0, dayIndex),
    });

  it("raises the renewal alert after 70 days of use", () => {
    const f = forecastOn(70);
    assert.equal(f.remaining, 10);
    assert.equal(f.rateSource, "real");
    assert.equal(f.runOutOn, addDays(D0, 80));
    assert.equal(f.renewalAlertOn, addDays(D0, 70));
  });

  it("is not due the day before", () => {
    assert.equal(forecastOn(69).renewalAlertOn, addDays(D0, 70));
  });
});

describe("minoxidil", () => {
  it("lasts 27 days per 60 ml bottle at 2 ml/day with a 10 % margin", () => {
    assert.equal(daysPerPackage(60, 0.1, daily(2)), 27);
    const f = stockForecast({
      regimens: [daily(2)],
      doses: [],
      stockEvents: [set(60, at(D0, 8))],
      wastePct: 0.1,
      renewalLeadDays: 10,
      today: D0,
    });
    assert.equal(f.remaining, 60);
    assert.equal(f.usable, 54);
    assert.equal(f.daysLeft, 27);
    assert.equal(f.rateSource, "planned");
  });

  it("falls back to the planned rate after a dose change", () => {
    const today = addDays(D0, 30);
    const change = addDays(today, -3);
    const f = stockForecast({
      regimens: [daily(2), daily(1, change)],
      doses: [...everyDay(D0, 27, 2), ...everyDay(change, 3, 1)],
      stockEvents: [set(120, at(D0, 8))],
      wastePct: 0.1,
      renewalLeadDays: 10,
      today,
    });
    assert.equal(f.remaining, 120 - 54 - 3);
    assert.equal(f.rateSource, "planned");
    assert.equal(f.rate, 1);
  });
});

describe("dailyRate", () => {
  it("uses the planned rate with fewer than 14 days of check-offs", () => {
    const today = addDays(D0, 40);
    assert.deepEqual(dailyRate([daily(1)], everyDay(addDays(today, -5), 5, 1), today), { rate: 1, source: "planned" });
  });

  it("uses the real average over the last 14 full days", () => {
    const today = addDays(D0, 40);
    const everyOtherDay = everyDay(addDays(today, -14), 14, 1).filter((_, i) => i % 2 === 0);
    assert.deepEqual(dailyRate([daily(1)], everyOtherDay, today), { rate: 0.5, source: "real" });
  });

  it("prorates the planned rate for chosen weekdays", () => {
    const mwf: Regimen = { effectiveFrom: D0, doseQty: 1, dosesPerDay: 1, frequency: "weekdays", weekdays: [1, 3, 5] };
    assert.equal(dailyRate([mwf], [], D0)?.rate, 3 / 7);
  });

  it("has no estimate for an as-needed treatment without history", () => {
    const asNeeded: Regimen = { effectiveFrom: D0, doseQty: 1, dosesPerDay: 1, frequency: "as_needed", weekdays: [] };
    assert.equal(dailyRate([asNeeded], [], D0), null);
  });

  it("gives no run-out date when nothing was taken for 14 days", () => {
    const today = addDays(D0, 40);
    const f = stockForecast({
      regimens: [daily(1)],
      doses: everyDay(D0, 20, 1),
      stockEvents: [set(80, at(D0, 8))],
      wastePct: 0,
      renewalLeadDays: 10,
      today,
    });
    assert.equal(f.rate, 0);
    assert.equal(f.runOutOn, null);
  });
});
