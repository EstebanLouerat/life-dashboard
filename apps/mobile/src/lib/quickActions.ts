import type { SQLiteDatabase } from "expo-sqlite";
import { today } from "@/lib/dates";
import { setNight } from "@/lib/nights";
import { intSetting, readSettings } from "@/lib/settings";
import type { Bucket } from "@/lib/sleep";
import { loadTreatments, logDose, undoDose } from "@/lib/treatments";

/**
 * One-tap logs done outside the app's screens: home-screen widgets and
 * notification buttons. Same writes as Today, always on the current day.
 */

export async function addWater(db: SQLiteDatabase, glasses = 1): Promise<void> {
  const glass = intSetting(await readSettings(db), "glass_ml", 250);
  await db.runAsync("INSERT INTO hydration_log (day, ml) VALUES (?, ?)", today(), glass * glasses);
}

/** Removes today's last glass (the widget's undo). */
export async function undoLastWater(db: SQLiteDatabase): Promise<void> {
  await db.runAsync("DELETE FROM hydration_log WHERE id = (SELECT MAX(id) FROM hydration_log WHERE day = ?)", today());
}

/** Checks a dose slot of today, or unchecks it when already logged. */
export async function toggleDose(db: SQLiteDatabase, treatmentId: number, slot: number): Promise<void> {
  const day = today();
  const state = (await loadTreatments(db, day)).find((s) => s.treatment.id === treatmentId);
  if (!state) return;
  const dose = state.doses.find((d) => d.day === day && d.slot === slot);
  if (dose) await undoDose(db, dose.id);
  else await logDose(db, state, day, slot, "taken");
}

/** Marks today's first open dose taken (notification button). Nothing open: nothing logged. */
export async function takeDose(db: SQLiteDatabase, treatmentId: number): Promise<void> {
  const day = today();
  const state = (await loadTreatments(db, day)).find((s) => s.treatment.id === treatmentId);
  const perDay = state?.regimen?.dosesPerDay ?? 1;
  const slot = Array.from({ length: perDay }, (_, i) => i + 1).find((n) => !state?.doses.some((d) => d.day === day && d.slot === n));
  if (state && slot) await logDose(db, state, day, slot, "taken");
}

/** Last night's range; picking the current one again clears it. */
export async function pickNight(db: SQLiteDatabase, bucket: Bucket): Promise<void> {
  const day = today();
  const row = await db.getFirstAsync<{ bucket: number }>("SELECT bucket FROM sleep_nights WHERE day = ?", day);
  await setNight(db, day, row?.bucket === bucket ? null : bucket);
}

/** Ticks or unticks an item of the latest grocery list. */
export async function toggleGroceryItem(db: SQLiteDatabase, name: string): Promise<void> {
  const plan = await db.getFirstAsync<{ id: number }>("SELECT id FROM grocery_plans ORDER BY id DESC LIMIT 1");
  if (!plan) return;
  const res = await db.runAsync("DELETE FROM grocery_checks WHERE plan_id = ? AND item_name = ?", plan.id, name);
  if (res.changes === 0) await db.runAsync("INSERT OR IGNORE INTO grocery_checks (plan_id, item_name) VALUES (?, ?)", plan.id, name);
}
