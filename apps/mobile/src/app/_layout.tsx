import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import * as SystemUI from "expo-system-ui";
import { migrate } from "@/db/migrations";
import { setupNotifications } from "@/lib/notifications";
import { loadThemePreference } from "@/lib/appearance";
import { useTheme } from "@/components/ui";
import { WorkoutRunnerProvider } from "@/components/WorkoutRunner";

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Type is Roboto, the Android system font: nothing to load before the first frame. */
export default function RootLayout() {
  useEffect(() => {
    setupNotifications().catch(console.warn);
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SQLiteProvider databaseName="life-dashboard.db" onInit={migrate}>
        <WorkoutRunnerProvider>
          <AppStack />
        </WorkoutRunnerProvider>
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
