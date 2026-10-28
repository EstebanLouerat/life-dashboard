import { Stack } from "expo-router";
import { useTheme } from "@/components/ui";

/**
 * Guided photo check, full screen above the tabs. Steps replace each other
 * (checklist → camera → finish), so back always closes the whole flow; an
 * unfinished check is kept and resumed next time.
 */
export default function HairCheckLayout() {
  const t = useTheme();
  return <Stack screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: t.bg } }} />;
}
