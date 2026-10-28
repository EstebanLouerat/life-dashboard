import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { coolingDaysLeft, fundingPlan, monthlySaved, previousMonth, type WishFunding } from "./savings.ts";

const wish = (id: number, priceCents: number, priority: 1 | 2 | 3, addedOn = "2026-10-01"): WishFunding => ({
  id,
  priceCents,
  priority,
  addedOn,
});

describe("fundingPlan", () => {
  it("funds by priority, then oldest first, and dates the rest with the monthly goal", () => {
    const items = [wish(1, 30000, 1), wish(2, 50000, 3), wish(3, 20000, 3, "2026-09-01")];
    const plan = fundingPlan(items, 60000, 10000);
    // order: 3 (essentiel, older), 2 (essentiel), 1 (envie)
    assert.deepEqual(plan.get(3), { fundedCents: 20000, monthsToGo: 0 });
    assert.deepEqual(plan.get(2), { fundedCents: 40000, monthsToGo: 1 }); // 100 € short
    assert.deepEqual(plan.get(1), { fundedCents: 0, monthsToGo: 4 }); // 100 + 300 € short
  });

  it("cannot date unfunded items without a monthly goal", () => {
    assert.deepEqual(fundingPlan([wish(1, 5000, 2)], 0, 0).get(1), { fundedCents: 0, monthsToGo: null });
  });

  it("ignores a negative balance", () => {
    assert.deepEqual(fundingPlan([wish(1, 5000, 2)], -2000, 5000).get(1), { fundedCents: 0, monthsToGo: 1 });
  });
});

describe("coolingDaysLeft", () => {
  it("counts down to the end of the cooling-off period", () => {
    assert.equal(coolingDaysLeft("2026-11-27", "2026-10-28"), 30);
    assert.equal(coolingDaysLeft("2026-10-20", "2026-10-28"), 0);
    assert.equal(coolingDaysLeft(null, "2026-10-28"), 0);
  });
});

describe("monthlySaved", () => {
  it("is the difference between consecutive balances", () => {
    const saved = monthlySaved([
      { month: "2026-10", balanceCents: 130000 },
      { month: "2026-08", balanceCents: 100000 },
      { month: "2026-09", balanceCents: 115000 },
    ]);
    assert.deepEqual(saved, [
      { month: "2026-09", savedCents: 15000 },
      { month: "2026-10", savedCents: 15000 },
    ]);
  });

  it("steps back across a year boundary", () => {
    assert.equal(previousMonth("2026-01"), "2025-12");
    assert.equal(previousMonth("2026-10"), "2026-09");
  });
});
