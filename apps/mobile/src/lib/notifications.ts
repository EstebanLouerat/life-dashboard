import { Platform } from "react-native";

type NotificationsModule = typeof import("expo-notifications");

export const CHANNEL_REMINDERS = "reminders";

let cached: NotificationsModule | null | undefined;

/**
 * expo-notifications throws at import time in Expo Go on Android (a native
 * module is missing there). A static import would take down the whole route
 * tree, so it is loaded lazily and failure means "reminders unavailable".
 * Works normally in a development build.
 */
function getNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
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
): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  await N.cancelScheduledNotificationAsync(id).catch(() => {});
  await N.scheduleNotificationAsync({
    identifier: id,
    content: { title, body },
    trigger: {
      type: N.SchedulableTriggerInputTypes.DAILY,
      channelId: CHANNEL_REMINDERS,
      hour,
      minute,
    },
  });
  return true;
}
