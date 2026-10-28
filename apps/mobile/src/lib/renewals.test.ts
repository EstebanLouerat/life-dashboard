import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cycleLabel, monthlyCents, nextRenewals, occurrence } from "./renewals.ts";
import { centsToInput, parseEuros } from "./money.ts";

const monthly = { unit: "month" as const, count: 1 };

describe("occurrence", () => {
  it("clamps to the end of shorter months without drifting", () => {
    assert.deepEqual(
      [0, 1, 2, 3].map((k) => occurrence("2026-01-31", monthly, k)),
      ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"],
    );
  });

  it("handles leap years for yearly plans", () => {
    assert.equal(occurrence("2028-02-29", { unit: "year", count: 1 }, 1), "2029-02-28");
    assert.equal(occurrence("2028-02-29", { unit: "year", count: 1 }, 4), "2032-02-29");
  });

  it("adds whole weeks", () => {
    assert.equal(occurrence("2026-10-28", { unit: "week", count: 2 }, 3), "2026-12-09");
  });
});

describe("nextRenewals", () => {
  it("rolls an old anchor forward to the next dates, today included", () => {
    assert.deepEqual(nextRenewals("2024-03-15", monthly, "2026-10-15", 3), ["2026-10-15", "2026-11-15", "2026-12-15"]);
    assert.deepEqual(nextRenewals("2024-03-15", monthly, "2026-10-16", 1), ["2026-11-15"]);
  });

  it("starts at a future anchor", () => {
    assert.deepEqual(nextRenewals("2026-12-01", { unit: "year", count: 1 }, "2026-10-28", 2), ["2026-12-01", "2027-12-01"]);
  });
});

describe("costs", () => {
  it("converts every cycle to a monthly cost", () => {
    assert.equal(monthlyCents(1200, monthly), 1200);
    assert.equal(monthlyCents(12000, { unit: "year", count: 1 }), 1000);
    assert.equal(monthlyCents(300, { unit: "week", count: 1 }), 1300);
    assert.equal(monthlyCents(3000, { unit: "month", count: 3 }), 1000);
  });

  it("labels cycles in French", () => {
    assert.equal(cycleLabel(monthly), "par mois");
    assert.equal(cycleLabel({ unit: "week", count: 2 }), "toutes les 2 semaines");
    assert.equal(cycleLabel({ unit: "year", count: 2 }), "tous les 2 ans");
  });
});

describe("money", () => {
  it("parses French and English amounts to cents", () => {
    assert.equal(parseEuros("9,99"), 999);
    assert.equal(parseEuros("9.9"), 990);
    assert.equal(parseEuros(" 1 299,50 €"), 129950);
    assert.equal(parseEuros("abc"), null);
    assert.equal(parseEuros("-5"), null);
    assert.equal(parseEuros("1,999"), null);
  });

  it("round-trips cents to an editable value", () => {
    assert.equal(centsToInput(999), "9,99");
    assert.equal(centsToInput(1000), "10");
  });
});
