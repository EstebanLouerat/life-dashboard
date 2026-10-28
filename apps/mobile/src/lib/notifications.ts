import { Platform } from "react-native";
import { isRunningInExpoGo } from "expo";

type NotificationsModule = typeof import("expo-notifications");

export const CHANNEL_REMINDERS = "reminders";
export const CHANNEL_TREATMENTS = "treatments";
export const CHANNEL_MONEY = "money";

let cached: NotificationsModule | null | undefined;

/**
 * expo-notifications throws at import time in Expo Go on Android (a native
 * module is missing there). A static import would take down the whole route
 * tree, so it is loaded lazily and "unavailable" means reminders are off.
 * Expo Go on Android is skipped before require(): a module that throws while
 * being required lazily is reported as fatal by Metro's require guard
 * (ErrorUtils.reportFatalError), even inside try/catch.
 * Works normally in a development build.
 */
function getNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === "android" && isRunningInExpoGo()) {
    console.warn("[notifications] Expo Go on Android: expo-notifications not loaded, reminders disabled.");
    cached = null;
    return cached;
  }
  try {
    const mod = require("expo-notifications") as NotificationsModule;
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    cached = mod;
  } catch {
    console.warn(
      "[notifications] expo-notifications unavailable in this runtime (Expo Go?). Reminders disabled.",
    );
    cached = null;
  }
  return cached;
}

export function notificationsAvailable(): boolean {
  return getNotifications() !== null;
}

/** Call once at startup. Returns false if unavailable or the user refused. */
export async function setupNotifications(): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  if (Platform.OS === "android") {
    await N.setNotificationChannelAsync(CHANNEL_REMINDERS, {
      name: "Rappels",
      importance: N.AndroidImportance.HIGH,
    });
    await N.setNotificationChannelAsync(CHANNEL_TREATMENTS, {
      name: "Traitements",
      importance: N.AndroidImportance.HIGH,
    });
    await N.setNotificationChannelAsync(CHANNEL_MONEY, {
      name: "Argent",
      importance: N.AndroidImportance.DEFAULT,
    });
  }
  const { granted } = await N.requestPermissionsAsync();
  return granted;
}

/**
 * Schedules (or reschedules) a daily reminder under a stable id, so calling
 * it again with new times never creates duplicates. Returns false if
 * notifications are unavailable in this runtime.
 */
export async function scheduleDaily(
  id: string,
  title: string,
  body: string,
  hour: number,
  minute: number,
  channelId = CHANNEL_REMINDERS,
): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  await N.cancelScheduledNotificationAsync(id).catch(() => {});
  await N.scheduleNotificationAsync({
    identifier: id,
    content: { title, body },
    trigger: {
      type: N.SchedulableTriggerInputTypes.DAILY,
      channelId,
      hour,
      minute,
    },
  });
  return true;
}

/** Weekly variant of scheduleDaily. `isoWeekday`: 1 = Monday … 7 = Sunday. */
export async function scheduleWeekly(
  id: string,
  title: string,
  body: string,
  isoWeekday: number,
  hour: number,
  minute: number,
  channelId = CHANNEL_REMINDERS,
): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  await N.cancelScheduledNotificationAsync(id).catch(() => {});
  await N.scheduleNotificationAsync({
    identifier: id,
    content: { title, body },
    trigger: {
      type: N.SchedulableTriggerInputTypes.WEEKLY,
      channelId,
      weekday: (isoWeekday % 7) + 1, // expo-notifications: 1 = Sunday
      hour,
      minute,
    },
  });
  return true;
}

/** Monthly variant of scheduleDaily, on day `day` (1–28 to exist every month). */
export async function scheduleMonthly(
  id: string,
  title: string,
  body: string,
  day: number,
  hour: number,
  minute: number,
  channelId = CHANNEL_REMINDERS,
): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  await N.cancelScheduledNotificationAsync(id).catch(() => {});
  await N.scheduleNotificationAsync({
    identifier: id,
    content: { title, body },
    trigger: { type: N.SchedulableTriggerInputTypes.MONTHLY, channelId, day, hour, minute },
  });
  return true;
}

/**
 * One-shot reminder under a stable id (replaces any previous one with that
 * id). A date in the past only cancels. Returns false if unavailable.
 */
export async function scheduleAt(
  id: string,
  title: string,
  body: string,
  date: Date,
  channelId = CHANNEL_REMINDERS,
): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  await N.cancelScheduledNotificationAsync(id).catch(() => {});
  if (date.getTime() <= Date.now()) return true;
  await N.scheduleNotificationAsync({
    identifier: id,
    content: { title, body },
    trigger: { type: N.SchedulableTriggerInputTypes.DATE, channelId, date },
  });
  return true;
}

export async function cancelScheduled(ids: string[]): Promise<void> {
  const N = getNotifications();
  if (!N) return;
  await Promise.all(ids.map((id) => N.cancelScheduledNotificationAsync(id).catch(() => {})));
}
