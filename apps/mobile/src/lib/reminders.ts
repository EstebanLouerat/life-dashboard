/**
 * Reminder preferences (Réglages › Rappels) and the hydration schedule they
 * produce. Pure: the scheduling itself lives in reminderSettings.ts.
 */

export type ReminderPrefs = {
  hydration: boolean;
  /** Minutes between two hydration reminders, one of HYDRATION_INTERVALS. */
  hydrationInterval: number;
  treatments: boolean;
  renewal: boolean;
  hairPhoto: boolean;
  workout: boolean;
};

export const HYDRATION_START_HOUR = 9;
export const HYDRATION_END_HOUR = 21;
export const HYDRATION_INTERVALS = [60, 90, 120, 150, 180, 210, 240] as const;
export const WORKOUT_REMINDER = { hour: 18, minute: 30 } as const;

export const DEFAULT_PREFS: ReminderPrefs = {
  hydration: false,
  hydrationInterval: 120,
  treatments: true,
  renewal: true,
  hairPhoto: true,
  workout: false,
};

/** Settings rows → preferences; anything missing or unreadable keeps its default. */
export function parsePrefs(settings: Record<string, string | undefined>): ReminderPrefs {
  const flag = (key: string, fallback: boolean) => (settings[key] === "1" ? true : settings[key] === "0" ? false : fallback);
  const interval = Number(settings.reminder_hydration_interval);
  return {
    hydration: flag("reminder_hydration", DEFAULT_PREFS.hydration),
    hydrationInterval: (HYDRATION_INTERVALS as readonly number[]).includes(interval) ? interval : DEFAULT_PREFS.hydrationInterval,
    treatments: flag("reminder_treatments", DEFAULT_PREFS.treatments),
    renewal: flag("reminder_renewal", DEFAULT_PREFS.renewal),
    hairPhoto: flag("reminder_hair", DEFAULT_PREFS.hairPhoto),
    workout: flag("reminder_workout", DEFAULT_PREFS.workout),
  };
}

export function prefsToSettings(p: ReminderPrefs): Record<string, string> {
  const b = (v: boolean) => (v ? "1" : "0");
  return {
    reminder_hydration: b(p.hydration),
    reminder_hydration_interval: String(p.hydrationInterval),
    reminder_treatments: b(p.treatments),
    reminder_renewal: b(p.renewal),
    reminder_hair: b(p.hairPhoto),
    reminder_workout: b(p.workout),
  };
}

/** Times from 9:00 to 21:00 included, every `intervalMinutes`. */
export function hydrationTimes(intervalMinutes: number): { hour: number; minute: number }[] {
  const times: { hour: number; minute: number }[] = [];
  const step = Math.max(30, intervalMinutes);
  for (let m = HYDRATION_START_HOUR * 60; m <= HYDRATION_END_HOUR * 60; m += step) {
    times.push({ hour: Math.floor(m / 60), minute: m % 60 });
  }
  return times;
}

/** "Toutes les 2 h", "Toutes les 1 h 30". */
export function intervalLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `Toutes les ${h} h${m ? ` ${m}` : ""}`;
}

/** "13:00": the next hydration reminder after `now`, or null when off or past 21:00. */
export function nextHydrationReminder(prefs: ReminderPrefs, now: Date): string | null {
  if (!prefs.hydration) return null;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const next = hydrationTimes(prefs.hydrationInterval).find((t) => t.hour * 60 + t.minute > minutes);
  return next ? `${String(next.hour).padStart(2, "0")}:${String(next.minute).padStart(2, "0")}` : null;
}
