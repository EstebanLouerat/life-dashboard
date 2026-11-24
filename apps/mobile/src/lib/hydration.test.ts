import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { waterGauge } from "./hydration.ts";

describe("waterGauge", () => {
  it("counts glasses when the goal fits in 12", () => {
    assert.deepEqual(waterGauge(1250, 2000, 250), { segments: 8, filled: 5, left: 3 });
    assert.deepEqual(waterGauge(2000, 2000, 250), { segments: 8, filled: 8, left: 0 });
    assert.deepEqual(waterGauge(1800, 2000, 300), { segments: 7, filled: 6, left: 1 });
  });

  it("does not call the goal reached before it is, when segments are capped", () => {
    assert.deepEqual(waterGauge(1800, 2000, 150), { segments: 12, filled: 10, left: 2 });
    assert.equal(waterGauge(2000, 2000, 150).left, 0);
    assert.equal(waterGauge(2600, 2000, 150).filled, 12);
  });
});
