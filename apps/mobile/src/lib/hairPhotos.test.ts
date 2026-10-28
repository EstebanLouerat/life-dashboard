import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  byZone,
  compareBrightness,
  firstPhoto,
  meanLuma,
  nextCheckDue,
  overdueDays,
  previousPhoto,
  reminderDayOfMonth,
  sceneEv,
} from "./hairPhotos.ts";

describe("meanLuma", () => {
  it("weights channels with Rec. 709 and ignores alpha", () => {
    const white = [255, 255, 255, 0];
    const black = [0, 0, 0, 255];
    assert.ok(Math.abs(meanLuma([...white, ...black]) - 127.5) < 1e-9);
    assert.ok(Math.abs(meanLuma([0, 255, 0, 255]) - 0.7152 * 255) < 1e-9);
  });

  it("returns 0 for no pixels", () => {
    assert.equal(meanLuma([]), 0);
  });
});

describe("sceneEv", () => {
  it("reads exposure time and ISO in any EXIF shape", () => {
    const a = sceneEv({ ExposureTime: 0.02, ISOSpeedRatings: 100, FNumber: 1.8 });
    const b = sceneEv({ ExposureTime: "1/50", ISOSpeedRatings: [100], FNumber: "18/10" });
    assert.ok(a !== null && b !== null && Math.abs(a - b) < 1e-9);
  });

  it("drops one EV when the room has half the light", () => {
    const bright = sceneEv({ ExposureTime: 1 / 100, ISOSpeedRatings: 200 })!;
    const dim = sceneEv({ ExposureTime: 1 / 50, ISOSpeedRatings: 200 })!;
    assert.ok(Math.abs(bright - dim - 1) < 1e-9);
  });

  it("is null without exposure data", () => {
    assert.equal(sceneEv({ FNumber: 1.8 }), null);
    assert.equal(sceneEv(undefined), null);
  });
});

describe("compareBrightness", () => {
  it("accepts the first photo of a zone as the reference", () => {
    assert.equal(compareBrightness({ luma: 90, ev: null }, null).ok, true);
  });

  it("accepts small gaps", () => {
    const r = compareBrightness({ luma: 110, ev: 7.4 }, { luma: 100, ev: 7 });
    assert.equal(r.ok, true);
    assert.ok(Math.abs(r.lumaDelta - 0.1) < 1e-9);
  });

  it("flags a darker photo beyond 15 %", () => {
    const r = compareBrightness({ luma: 80, ev: null }, { luma: 100, ev: null });
    assert.equal(r.ok, false);
    assert.match(r.message, /20 % plus sombre/);
    assert.equal(r.evDelta, null);
  });

  it("flags a dimmer room even when auto-exposure kept the luma", () => {
    const r = compareBrightness({ luma: 101, ev: 5.5 }, { luma: 100, ev: 7 });
    assert.equal(r.ok, false);
    assert.match(r.message, /^La pièce est nettement plus sombre/);
  });
});

describe("next check", () => {
  it("is due now when there has never been one", () => {
    assert.equal(nextCheckDue(null, "2026-10-28"), "2026-10-28");
    assert.equal(overdueDays(null, "2026-10-28"), 0);
  });

  it("is due one calendar month later, clamped to the month's end", () => {
    assert.equal(nextCheckDue("2026-01-31", "2026-02-01"), "2026-02-28");
    assert.equal(nextCheckDue("2026-10-05", "2026-10-28"), "2026-11-05");
  });

  it("counts days overdue, null before the due date", () => {
    assert.equal(overdueDays("2026-09-20", "2026-10-19"), null);
    assert.equal(overdueDays("2026-09-20", "2026-10-20"), 0);
    assert.equal(overdueDays("2026-09-20", "2026-10-28"), 8);
  });

  it("keeps the monthly reminder on a day every month has", () => {
    assert.equal(reminderDayOfMonth("2026-11-05"), 5);
    assert.equal(reminderDayOfMonth("2026-12-31"), 28);
  });
});

describe("photo lookups", () => {
  const photos = [
    { id: 1, checkId: 1, day: "2026-08-01", zone: "vertex" as const },
    { id: 2, checkId: 2, day: "2026-09-01", zone: "vertex" as const },
    { id: 3, checkId: 2, day: "2026-09-01", zone: "frontal" as const },
    { id: 4, checkId: 3, day: "2026-10-01", zone: "vertex" as const },
  ];

  it("uses the zone's first photo as the brightness reference", () => {
    assert.equal(firstPhoto(photos, "vertex")?.id, 1);
    assert.equal(firstPhoto(photos, "vertex", 1)?.id, 2);
    assert.equal(firstPhoto(photos, "temples"), null);
  });

  it("ghosts the latest photo from an earlier check", () => {
    assert.equal(previousPhoto(photos, "vertex", 3)?.id, 2);
    assert.equal(previousPhoto(photos, "vertex", 1), null);
    assert.equal(previousPhoto(photos, "frontal", 3)?.id, 3);
  });

  it("groups by zone, oldest first", () => {
    const g = byZone([...photos].reverse());
    assert.deepEqual(g.vertex.map((p) => p.id), [1, 2, 4]);
    assert.deepEqual(g.top, []);
  });
});
