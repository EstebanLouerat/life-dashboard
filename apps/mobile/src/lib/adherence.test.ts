import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addDays, atLocalTime } from "./dates.ts";
import { adherence, dayProgress, history } from "./adherence.ts";
import type { Dose, Regimen } from "./stock.ts";

const D0 = "2026-01-05"; // a Monday

const daily: Regimen = { effectiveFrom: D0, doseQty: 1, dosesPerDay: 1, frequency: "daily", weekdays: [] };

const dose = (day: string, status: Dose["status"] = "taken", takenOn = day): Dose => ({
  day,
  slot: 1,
  qty: status === "taken" ? 1 : 0,
  status,
  takenAt: atLocalTime(takenOn, 9).toISOString(),
});

describe("history", () => {
  it("shows missed, skipped, late and pending days", () => {
    const today = addDays(D0, 4);
    const doses = [dose(D0), dose(addDays(D0, 2), "skipped"), dose(addDays(D0, 3), "taken", today)];
    const statuses = history([daily], doses, today, 6).map((e) => [e.status, e.late]);
    assert.deepEqual(statuses, [
      ["before", false],
      ["taken", false],
      ["missed", false],
      ["skipped", false],
      ["taken", true],
      ["pending", false],
    ]);
  });

  it("evaluates past days with the regimen in force at the time", () => {
    const switchDay = addDays(D0, 7); // Monday
    const mwf: Regimen = { effectiveFrom: switchDay, doseQty: 1, dosesPerDay: 1, frequency: "weekdays", weekdays: [1, 3, 5] };
    const entries = history([daily, mwf], [], addDays(D0, 9), 4);
    assert.deepEqual(
      entries.map((e) => e.status),
      ["missed", "missed", "off", "pending"],
    );
  });
});

describe("adherence", () => {
  it("counts skipped and missed days as not taken, but not today before logging", () => {
    const today = addDays(D0, 7);
    const doses = [0, 1, 2, 4, 5].map((i) => dose(addDays(D0, i))).concat(dose(addDays(D0, 6), "skipped"));
    const a = adherence([daily], doses, today, 7);
    assert.equal(a.expected, 6);
    assert.equal(a.taken, 4);
  });

  it("has no ratio for an as-needed treatment", () => {
    const asNeeded: Regimen = { ...daily, frequency: "as_needed" };
    const a = adherence([asNeeded], [dose(D0), dose(addDays(D0, 1))], addDays(D0, 2), 7);
    assert.equal(a.ratio, null);
    assert.equal(a.takenCount, 2);
  });
});

describe("dayProgress", () => {
  it("counts today's expected doses and the logged ones, taken or skipped", () => {
    const twice: Regimen = { ...daily, dosesPerDay: 2 };
    const states = [
      { regimen: twice, doses: [dose(D0), { ...dose(D0, "skipped"), slot: 2 }, { ...dose(D0), slot: 3 }] },
      { regimen: daily, doses: [dose(addDays(D0, -1))] },
      { regimen: null, doses: [dose(D0)] },
      { regimen: { ...daily, frequency: "as_needed" as const }, doses: [dose(D0)] },
    ];
    assert.deepEqual(dayProgress(states, D0), { expected: 3, logged: 2 });
  });
});
