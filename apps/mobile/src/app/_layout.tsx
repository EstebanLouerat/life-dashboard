import { useEffect } from "react";
import { Text } from "react-native";
import { Tabs } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { migrate } from "@/db/migrations";
import { setupNotifications } from "@/lib/notifications";
import { useTheme } from "@/components/ui";

function icon(glyph: string) {
  return ({ focused }: { focused: boolean }) => (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{glyph}</Text>
  );
}

/**
 * Three tabs only: Today (daily one-tap logs), Modules (hub, one stack per
 * module) and Settings. New modules go in src/app/modules/, not in a new tab.
 */
export default function RootLayout() {
  const t = useTheme();

  useEffect(() => {
    setupNotifications().catch(console.warn);
  }, []);

  return (
    <SQLiteProvider databaseName="life-dashboard.db" onInit={migrate}>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: t.card },
          headerTintColor: t.text,
          tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
          tabBarActiveTintColor: t.accent,
          tabBarInactiveTintColor: t.muted,
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Aujourd'hui", tabBarIcon: icon("☀️") }} />
        <Tabs.Screen name="modules" options={{ title: "Modules", headerShown: false, tabBarIcon: icon("🧩") }} />
        <Tabs.Screen name="reglages" options={{ title: "Réglages", tabBarIcon: icon("⚙️") }} />
      </Tabs>
    </SQLiteProvider>
  );
}
