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
export function saveReminderPrefs(db: SQLiteDatabase, prefs: ReminderPrefs): Promise<void> {
  // One save at a time: a slider drag fires several, and interleaved cancel / schedule calls would mix two plans.
  const run = queue.then(() => apply(db, prefs));
  queue = run.catch(() => {});
  return run;
}

let queue: Promise<void> = Promise.resolve();

async function apply(db: SQLiteDatabase, prefs: ReminderPrefs): Promise<void> {
  for (const [key, value] of Object.entries(prefsToSettings(prefs))) await writeSetting(db, key, value);
  await cancelScheduled(HYDRATION_IDS);
  if (prefs.hydration) {
    const times = hydrationTimes(prefs.hydrationInterval);
    for (const [i, t] of times.entries()) {
      await scheduleDaily(`hydration-${i}`, "Hydratation", "Un verre d'eau ?", t.hour, t.minute, CHANNEL_REMINDERS, {
        domain: "eau",
        category: "hydration",
        url: "/",
      });
    }
  }
  if (prefs.workout) {
    await scheduleDaily(WORKOUT_ID, "Séance du jour", "10 minutes, c'est parti.", WORKOUT_REMINDER.hour, WORKOUT_REMINDER.minute, CHANNEL_REMINDERS, {
      domain: "sport",
      url: "/sport",
    });
  } else {
    await cancelScheduled([WORKOUT_ID]);
  }
}
