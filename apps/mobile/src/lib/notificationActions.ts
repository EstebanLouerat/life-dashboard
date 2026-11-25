import { router, type Href } from "expo-router";
import type { NotificationResponse } from "expo-notifications";
import { database } from "@/db/standalone";
import { CHANNEL_TREATMENTS, dismissNotification, scheduleAt, stillShown } from "@/lib/notifications";
import { addWater, takeDose } from "@/lib/quickActions";
import { refreshWidgets } from "@/widgets/refresh";

const SNOOZE_MINUTES = 15;
/** expo-notifications' DEFAULT_ACTION_IDENTIFIER (the module is loaded lazily, see lib/notifications). */
const TAP = "expo.modules.notifications.actions.DEFAULT";
/** Buttons reach both the background task and the in-app listener when the app is alive: one run each. */
const handled = new Set<string>();

/** Reads the data of a reminder: an object in the app, a JSON string in the background task (Android). */
function dataOf(r: NotificationResponse): Record<string, unknown> {
  const content = r.notification.request.content as { data?: Record<string, unknown> | null; dataString?: string };
  if (content.data) return content.data;
  try {
    return content.dataString ? JSON.parse(content.dataString) : {};
  } catch {
    return {};
  }
}

/**
 * A tap opens the reminder's screen; the buttons log without opening the
 * app (lib/notifications › setCategories), then dismiss the notification.
 */
export async function handleNotificationResponse(r: NotificationResponse): Promise<void> {
  const { request, date } = r.notification;
  const key = `${request.identifier}:${r.actionIdentifier}:${date}`;
  if (handled.has(key)) return;
  handled.add(key);
  const data = dataOf(r);
  if (r.actionIdentifier === TAP) {
    if (typeof data.url === "string") router.push(data.url as Href);
    return;
  }
  if (!(await stillShown(request.identifier, date))) return;

  switch (r.actionIdentifier) {
    case "water":
      await addWater(await database());
      refreshWidgets("Water");
      break;
    case "take":
      await takeDose(await database(), Number(data.treatmentId));
      refreshWidgets("Treatments");
      break;
    case "snooze": {
      const { title, body } = request.content;
      await scheduleAt(`${request.identifier.replace(/-snooze$/, "")}-snooze`, title ?? "", body ?? "", new Date(Date.now() + SNOOZE_MINUTES * 60_000), CHANNEL_TREATMENTS, {
        domain: "sante",
        category: "treatment",
        url: typeof data.url === "string" ? data.url : undefined,
        data: { treatmentId: Number(data.treatmentId) },
      });
      break;
    }
    default:
      return;
  }
  await dismissNotification(request.identifier);
}
