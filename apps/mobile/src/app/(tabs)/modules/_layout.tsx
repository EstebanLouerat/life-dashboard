import { Stack } from "expo-router";
import { useTheme } from "@/components/ui";

/** Screens draw their own large-title header (see Screen), so the native one is hidden. */
export default function ModulesLayout() {
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
