import { Stack } from "expo-router";
import { useTheme } from "@/components/ui";

/**
 * Stack inside a tab: screens draw their own large-title header (see
 * Screen), so the native one is hidden, and the tab bar stays visible.
 */
export function TabStack() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: t.bg },
      }}
    />
  );
}
