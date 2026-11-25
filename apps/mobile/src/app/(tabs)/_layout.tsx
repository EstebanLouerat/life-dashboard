import { Tabs } from "expo-router";
import { ChromeProvider, SnackbarProvider, useTheme } from "@/components/ui";
import { TabBar } from "@/components/TabBar";

/**
 * Five tabs: Accueil (the dashboard, titled Aujourd'hui), Courses, Sport, Santé and Plus
 * (Wishlist, Abonnements, Importer, Backlog, Réglages). Each tab is a stack;
 * a new module goes under Plus or inside its domain's tab, not in a new tab.
 * The tab bar also hosts the undo snackbar and the session accessory.
 */
export default function TabsLayout() {
  const t = useTheme();
  return (
    <ChromeProvider>
      <SnackbarProvider>
        <Tabs
          tabBar={(props) => <TabBar {...props} />}
          screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.bg } }}
        >
          <Tabs.Screen name="(aujourdhui)" options={{ title: "Accueil" }} />
          <Tabs.Screen name="courses" options={{ title: "Courses" }} />
          <Tabs.Screen name="sport" options={{ title: "Sport" }} />
          <Tabs.Screen name="sante" options={{ title: "Santé" }} />
          <Tabs.Screen name="plus" options={{ title: "Plus" }} />
        </Tabs>
      </SnackbarProvider>
    </ChromeProvider>
  );
}
