/**
 * Entry points that run without the app's screens (imported first by
 * index.ts): home-screen widget taps and notification buttons, while the app
 * is in the background or killed. Both are no-ops in Expo Go and on the web.
 */
import { handleNotificationResponse } from "@/lib/notificationActions";
import { registerNotificationTask } from "@/lib/notifications";
import { widgetsAvailable } from "@/widgets/refresh";

if (widgetsAvailable) {
  // Loaded on demand: the library throws at import without its native module.
  const { registerWidgetTaskHandler } = require("react-native-android-widget") as typeof import("react-native-android-widget");
  registerWidgetTaskHandler((require("@/widgets/render") as typeof import("@/widgets/render")).widgetTaskHandler);
}

registerNotificationTask(handleNotificationResponse);
