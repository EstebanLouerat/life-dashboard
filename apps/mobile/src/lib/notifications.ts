import { Platform } from "react-native";
import { isRunningInExpoGo } from "expo";
import type { NotificationResponse, NotificationTaskPayload } from "expo-notifications";
import { palettes, type Domain } from "@/components/ui/theme";

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
  if (Platform.OS === "web") {
    // Web preview: no scheduled local notifications; Today's tiles cover the alerts.
    cached = null;
    return cached;
  }
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
  await setCategories(N);
  const { granted } = await N.requestPermissionsAsync();
  return granted;
}

/** Buttons shown when a notification is expanded (see lib/notificationActions). */
export type Category = "hydration" | "treatment";

async function setCategories(N: NotificationsModule) {
  const background = { opensAppToForeground: false };
  await N.setNotificationCategoryAsync("hydration", [{ identifier: "water", buttonTitle: "+1 verre", options: background }]);
  await N.setNotificationCategoryAsync("treatment", [
    { identifier: "take", buttonTitle: "Pris", options: background },
    { identifier: "snooze", buttonTitle: "Dans 15 min", options: background },
  ]);
}

/**
 * What a reminder carries besides its text: the module colour (One UI shows
 * the app icon on the left and tints the small icon and the buttons with it),
 * its buttons, the screen a tap opens, and data for the buttons.
 */
export type Extra = { domain?: Domain; category?: Category; url?: string; data?: Record<string, string | number> };

function content(title: string, body: string, extra: Extra) {
  return {
    title,
    body,
    color: extra.domain ? palettes.light.domain[extra.domain].accent : undefined,
    categoryIdentifier: extra.category,
    data: { ...extra.data, ...(extra.url ? { url: extra.url } : {}) },
  };
}

const NOTIFICATION_TASK = "notification-actions";

/**
 * Notification buttons tapped while the app is in the background or killed
 * run as a task (Android). Call at startup, in the global scope of the entry.
 */
export function registerNotificationTask(handler: (response: NotificationResponse) => Promise<void>): void {
  const N = getNotifications();
  if (!N) return;
  const TaskManager = require("expo-task-manager") as typeof import("expo-task-manager");
  TaskManager.defineTask<NotificationTaskPayload>(NOTIFICATION_TASK, async ({ data, error }) => {
    if (error || !data || !("actionIdentifier" in data)) return;
    await handler(data);
  });
  N.registerTaskAsync(NOTIFICATION_TASK).catch(console.warn);
}

/** Taps and buttons while the app runs, plus the tap that launched it. Returns the unsubscribe. */
export function onNotificationResponse(handler: (response: NotificationResponse) => void): () => void {
  const N = getNotifications();
  if (!N) return () => {};
  // Only a plain tap launches the app; buttons never do.
  const launch = N.getLastNotificationResponse();
  if (launch?.actionIdentifier === N.DEFAULT_ACTION_IDENTIFIER) handler(launch);
  const sub = N.addNotificationResponseReceivedListener(handler);
  return () => sub.remove();
}

/**
 * Whether this very notification (same id, same delivery) is still in the
 * shade. A button acts only then: a response replayed later (Android queues
 * them until the app listens) finds it dismissed and logs nothing twice.
 */
export async function stillShown(id: string, date: number): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  const shown = await N.getPresentedNotificationsAsync().catch(() => []);
  return shown.some((n) => n.request.identifier === id && Math.abs(n.date - date) < 1000);
}

/** Action buttons do not dismiss their notification by themselves. */
export async function dismissNotification(id: string): Promise<void> {
  await getNotifications()?.dismissNotificationAsync(id).catch(() => {});
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
  extra: Extra = {},
): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  await N.cancelScheduledNotificationAsync(id).catch(() => {});
  await N.scheduleNotificationAsync({
    identifier: id,
    content: content(title, body, extra),
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
  extra: Extra = {},
): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  await N.cancelScheduledNotificationAsync(id).catch(() => {});
  await N.scheduleNotificationAsync({
    identifier: id,
    content: content(title, body, extra),
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
  extra: Extra = {},
): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  await N.cancelScheduledNotificationAsync(id).catch(() => {});
  await N.scheduleNotificationAsync({
    identifier: id,
    content: content(title, body, extra),
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
  extra: Extra = {},
): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  await N.cancelScheduledNotificationAsync(id).catch(() => {});
  if (date.getTime() <= Date.now()) return true;
  await N.scheduleNotificationAsync({
    identifier: id,
    content: content(title, body, extra),
    trigger: { type: N.SchedulableTriggerInputTypes.DATE, channelId, date },
  });
  return true;
}

export async function cancelScheduled(ids: string[]): Promise<void> {
  const N = getNotifications();
  if (!N) return;
  await Promise.all(ids.map((id) => N.cancelScheduledNotificationAsync(id).catch(() => {})));
}
