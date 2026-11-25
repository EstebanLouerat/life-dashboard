import { Platform, TurboModuleRegistry } from "react-native";

export const WIDGET_NAMES = ["Water", "Treatments", "Sleep", "Groceries", "Workout"] as const;
export type WidgetName = (typeof WIDGET_NAMES)[number];

/** Home-screen widgets exist only in an Android build (not in Expo Go, not on the web). */
export const widgetsAvailable = Platform.OS === "android" && TurboModuleRegistry.get("AndroidWidget") != null;

/** Redraws the given widgets (all when none given) from the database. No-op where widgets don't exist. */
export function refreshWidgets(...names: WidgetName[]): void {
  if (!widgetsAvailable) return;
  // Loaded on demand: react-native-android-widget throws at import without its native module.
  const { updateWidgets } = require("./render") as typeof import("./render");
  updateWidgets(names.length ? names : [...WIDGET_NAMES]).catch(console.warn);
}
