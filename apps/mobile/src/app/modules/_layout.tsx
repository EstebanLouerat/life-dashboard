import { Stack } from "expo-router";
import { useTheme } from "@/components/ui";

export default function ModulesLayout() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.card },
        headerTintColor: t.text,
        contentStyle: { backgroundColor: t.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Modules" }} />
      <Stack.Screen name="courses" options={{ title: "Courses" }} />
      <Stack.Screen name="sport" options={{ title: "Sport" }} />
      <Stack.Screen name="hair-care/index" options={{ title: "Hair care" }} />
      <Stack.Screen name="hair-care/[id]" options={{ title: "Traitement" }} />
    </Stack>
  );
}
