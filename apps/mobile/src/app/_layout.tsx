import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import * as SystemUI from "expo-system-ui";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/plus-jakarta-sans";
import { migrate } from "@/db/migrations";
import { setupNotifications } from "@/lib/notifications";
import { loadThemePreference } from "@/lib/appearance";
import { useTheme } from "@/components/ui";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    setupNotifications().catch(console.warn);
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SQLiteProvider databaseName="life-dashboard.db" onInit={migrate}>
        <AppStack />
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Root stack: the three tabs live in the (tabs) group; full-screen flows
 * that must hide the tab bar (the guided hair photo check, quick capture)
 * are pushed over them from the bottom and leave the same way.
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
        <Stack.Screen name="hair-check" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="capture" options={{ animation: "slide_from_bottom" }} />
      </Stack>
    </>
  );
}
