import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const CHANNEL_REMINDERS = "reminders";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Call once at startup. Returns false if the user refused notifications. */
export async function setupNotifications(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_REMINDERS, {
      name: "Rappels",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
}

/**
 * Schedules (or reschedules) a daily reminder under a stable id, so calling
 * it again with new times never creates duplicates.
 */
export async function scheduleDaily(id: string, title: string, body: string, hour: number, minute: number) {
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title, body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      channelId: CHANNEL_REMINDERS,
      hour,
      minute,
    },
  });
}
