import type { SQLiteDatabase } from "expo-sqlite";
import { cancelScheduled, CHANNEL_REMINDERS, scheduleDaily } from "@/lib/notifications";
import { hydrationTimes, parsePrefs, prefsToSettings, WORKOUT_REMINDER, type ReminderPrefs } from "@/lib/reminders";
import { readSettings, writeSetting } from "@/lib/settings";

/** Stable ids: rescheduling replaces, never duplicates. "hydration-am/pm" are the pre-redesign ids. */
const HYDRATION_IDS = [...Array.from({ length: 16 }, (_, i) => `hydration-${i}`), "hydration-am", "hydration-pm"];
const WORKOUT_ID = "workout";

export async function loadReminderPrefs(db: SQLiteDatabase): Promise<ReminderPrefs> {
  return parsePrefs(await readSettings(db));
}

/**
 * Saves the preferences and reschedules hydration and the session reminder.
 * Treatment, renewal and photo reminders follow at their next refresh
 * (refreshTreatments / refreshHairChecks), which read the same preferences.
 */
export async function saveReminderPrefs(db: SQLiteDatabase, prefs: ReminderPrefs): Promise<void> {
  for (const [key, value] of Object.entries(prefsToSettings(prefs))) await writeSetting(db, key, value);
  await cancelScheduled(HYDRATION_IDS);
  if (prefs.hydration) {
    const times = hydrationTimes(prefs.hydrationInterval);
    for (const [i, t] of times.entries()) {
      await scheduleDaily(`hydration-${i}`, "Hydratation", "Un verre d'eau ?", t.hour, t.minute, CHANNEL_REMINDERS);
    }
  }
  if (prefs.workout) {
    await scheduleDaily(WORKOUT_ID, "Séance du jour", "10 minutes, c'est parti.", WORKOUT_REMINDER.hour, WORKOUT_REMINDER.minute, CHANNEL_REMINDERS);
  } else {
    await cancelScheduled([WORKOUT_ID]);
  }
}
