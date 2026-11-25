import { useEffect } from "react";
import { AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import * as SystemUI from "expo-system-ui";
import { migrate } from "@/db/migrations";
import { onNotificationResponse, setupNotifications } from "@/lib/notifications";
import { handleNotificationResponse } from "@/lib/notificationActions";
import { readSettings } from "@/lib/settings";
import { loadThemePreference } from "@/lib/appearance";
import { loadReminderPrefs, saveReminderPrefs } from "@/lib/reminderSettings";
import { useTheme } from "@/components/ui";
import { runner } from "@/components/WorkoutRunner";
import { refreshWidgets } from "@/widgets/refresh";

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Type is Roboto, the Android system font: nothing to load before the first frame. */
export default function RootLayout() {
  useEffect(() => {
    setupNotifications().catch(console.warn);
    SplashScreen.hideAsync().catch(() => {});
    // A tap opens the reminder's screen; buttons tapped with the app open are logged here.
    const unsubscribe = onNotificationResponse((r) => {
      handleNotificationResponse(r).catch(console.warn);
    });
    // Home-screen widgets catch up with what was logged in the app.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") refreshWidgets();
    });
    return () => {
      unsubscribe();
      sub.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SQLiteProvider databaseName="life-dashboard.db" onInit={migrate}>
        <AppStack />
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Root stack: the five tabs live in the (tabs) group; full-screen flows that
 * must hide the tab bar (the guided session timer, the hair photo check,
 * quick capture) are pushed over them from the bottom and leave the same way.
 */
function AppStack() {
  const db = useSQLiteContext();
  const t = useTheme();

  useEffect(() => {
    loadThemePreference(db).catch(console.warn);
    readSettings(db)
      .then((s) => runner.setBubble(s.live_bubble === "1"))
      .catch(console.warn);
    // Reschedules hydration and session reminders from the saved switches, which also drops pre-redesign ids.
    loadReminderPrefs(db)
      .then((prefs) => saveReminderPrefs(db, prefs))
      .catch(console.warn);
  }, [db]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(t.bg).catch(() => {});
  }, [t.bg]);

  return (
    <>
      <StatusBar style={t.dark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="seance" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="hair-check" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="capture" options={{ animation: "slide_from_bottom" }} />
      </Stack>
    </>
  );
}
