import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { availableTiles, DEFAULT_LAYOUT, moveTile, parseLayout, serializeLayout, tileRows, type LayoutEntry } from "./dashboard.ts";
import { bucketFromHours, mergeNights, nightsDetail, nightsSummary, previousNights, usualBucket, weekdayInitial } from "./sleep.ts";

describe("dashboard layout", () => {
  it("falls back to the default on missing or broken JSON", () => {
    assert.deepEqual(parseLayout(null), DEFAULT_LAYOUT);
    assert.deepEqual(parseLayout("{oops"), DEFAULT_LAYOUT);
    assert.deepEqual(parseLayout('{"id":"hydration"}'), DEFAULT_LAYOUT);
  });

  it("drops unknown tiles and duplicates, and fixes sizes a tile can't take", () => {
    const layout = parseLayout(
      JSON.stringify([
        { id: "sleep", size: "half" },
        { id: "appart", size: "half" },
        { id: "workout", size: "large" },
        { id: "workout", size: "half" },
      ]),
    );
    assert.deepEqual(layout, [
      { id: "sleep", size: "large" },
      { id: "workout", size: "large" },
    ]);
    assert.deepEqual(parseLayout(serializeLayout(layout)), layout);
  });

  it("lists the tiles that can be added", () => {
    assert.deepEqual(availableTiles(DEFAULT_LAYOUT), []);
    assert.deepEqual(availableTiles([{ id: "sleep", size: "large" }]).slice(0, 2), ["hydration", "treatments"]);
  });

  it("moves a tile", () => {
    const ids = (l: LayoutEntry[]) => l.map((e) => e.id);
    assert.deepEqual(ids(moveTile(DEFAULT_LAYOUT, 0, 2)).slice(0, 3), ["treatments", "sleep", "hydration"]);
    assert.deepEqual(ids(moveTile(DEFAULT_LAYOUT, 3, 0)).slice(0, 2), ["workout", "hydration"]);
    assert.equal(moveTile(DEFAULT_LAYOUT, 9, 0), DEFAULT_LAYOUT);
  });

  it("pairs half tiles two by two", () => {
    const rows = tileRows([
      { id: "workout", size: "half" },
      { id: "hydration", size: "large" },
      { id: "dinner", size: "half" },
      { id: "savings", size: "half" },
      { id: "hair", size: "half" },
    ]);
    assert.deepEqual(
      rows.map((r) => r.map((e) => e.id)),
      [["workout"], ["hydration"], ["dinner", "savings"], ["hair"]],
    );
  });
});

describe("sleep ranges", () => {
  it("maps hours to a range", () => {
    assert.deepEqual([5.9, 6, 6.99, 7.5, 8, 10].map(bucketFromHours), [0, 1, 1, 2, 3, 3]);
  });

  it("keeps one night per morning, the tapped range first", () => {
    const merged = mergeNights([{ day: "2026-11-17", bucket: 2 }], [
      { day: "2026-11-17", bucket: 0 },
      { day: "2026-11-16", bucket: 3 },
    ]);
    assert.deepEqual(merged, [
      { day: "2026-11-16", bucket: 3 },
      { day: "2026-11-17", bucket: 2 },
    ]);
  });

  it("lists the 7 previous mornings, oldest first", () => {
    const nights = previousNights([{ day: "2026-11-16", bucket: 1 }], "2026-11-17");
    assert.equal(nights.length, 7);
    assert.deepEqual(nights[0], { day: "2026-11-10", bucket: null });
    assert.deepEqual(nights[6], { day: "2026-11-16", bucket: 1 });
    assert.equal(weekdayInitial("2026-11-16"), "L");
    assert.equal(weekdayInitial("2026-11-15"), "D");
  });

  it("summarises the week", () => {
    assert.equal(usualBucket([null, null]), null);
    assert.equal(usualBucket([2, 3, 2, 3, null]), 3);
    assert.equal(nightsSummary([2, 2, 1, null, 2, 0, 2]), "7 nuits précédentes : surtout 7–8 h");
    assert.equal(nightsSummary([null]), "Tes nuits notées apparaîtront ici, sur 7 jours.");
    assert.equal(nightsDetail([2, 2, 0, 2, 2, null, 1]), "7 dernières nuits : 4 entre 7 et 8 h · 1 de moins de 6 h");
  });
});
