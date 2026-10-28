import { Tabs } from "expo-router";
import { useTheme } from "@/components/ui";
import { TabBar } from "@/components/TabBar";

/**
 * Three tabs only: Today (daily one-tap logs), Modules (hub, one stack for
 * every module) and Settings. New modules go in src/app/(tabs)/modules/, not in a tab.
 */
export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.bg } }}>
      <Tabs.Screen name="index" options={{ title: "Aujourd'hui" }} />
      <Tabs.Screen name="modules" options={{ title: "Modules" }} />
      <Tabs.Screen name="reglages" options={{ title: "Réglages" }} />
    </Tabs>
  );
}
