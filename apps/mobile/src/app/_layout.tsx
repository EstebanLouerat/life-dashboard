import { useEffect } from "react";
import { SplashScreen, Tabs } from "expo-router";
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
import { TabBar } from "@/components/TabBar";

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
    <SQLiteProvider databaseName="life-dashboard.db" onInit={migrate}>
      <AppTabs />
    </SQLiteProvider>
  );
}

/**
 * Three tabs only: Today (daily one-tap logs), Modules (hub, one stack for
 * every module) and Settings. New modules go in src/app/modules/, not in a tab.
 */
function AppTabs() {
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
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.bg } }}
      >
        <Tabs.Screen name="index" options={{ title: "Aujourd'hui" }} />
        <Tabs.Screen name="modules" options={{ title: "Modules" }} />
        <Tabs.Screen name="reglages" options={{ title: "Réglages" }} />
      </Tabs>
    </>
  );
}
