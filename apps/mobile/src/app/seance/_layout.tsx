import { Stack } from "expo-router";
import { DomainScope, useTheme } from "@/components/ui";

/**
 * Guided session, full screen above the tabs (no tab bar): the timer, then
 * the feedback. Closing the timer keeps the session running in the
 * accessory above the tab bar.
 */
export default function SessionLayout() {
  const t = useTheme();
  return (
    <DomainScope domain="sport">
      <Stack screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: t.bg } }} />
    </DomainScope>
  );
}
