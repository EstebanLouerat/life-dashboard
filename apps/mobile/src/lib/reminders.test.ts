import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFS, hydrationTimes, intervalLabel, nextHydrationReminder, parsePrefs, prefsToSettings } from "./reminders.ts";

describe("reminder preferences", () => {
  it("defaults what is missing and round-trips through settings", () => {
    assert.deepEqual(parsePrefs({}), DEFAULT_PREFS);
    assert.equal(parsePrefs({ reminder_hydration_interval: "45" }).hydrationInterval, 120);
    const prefs = { ...DEFAULT_PREFS, hydration: true, hydrationInterval: 90, renewal: false };
    assert.deepEqual(parsePrefs(prefsToSettings(prefs)), prefs);
  });

  it("spreads hydration reminders from 9:00 to 21:00", () => {
    assert.equal(hydrationTimes(120).length, 7);
    assert.deepEqual(hydrationTimes(120).at(-1), { hour: 21, minute: 0 });
    assert.deepEqual(hydrationTimes(90).slice(0, 2), [
      { hour: 9, minute: 0 },
      { hour: 10, minute: 30 },
    ]);
    assert.equal(intervalLabel(120), "Toutes les 2 h");
    assert.equal(intervalLabel(90), "Toutes les 1 h 30");
  });

  it("finds the next hydration reminder", () => {
    const on = { ...DEFAULT_PREFS, hydration: true };
    assert.equal(nextHydrationReminder(on, new Date(2026, 10, 17, 11, 5)), "13:00");
    assert.equal(nextHydrationReminder(on, new Date(2026, 10, 17, 21, 30)), null);
    assert.equal(nextHydrationReminder(DEFAULT_PREFS, new Date(2026, 10, 17, 11, 5)), null);
  });
});
