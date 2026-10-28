import { View } from "react-native";
import { router } from "expo-router";
import { Card, Icon, IconTile, PressableScale, space, Txt, useTheme } from "@/components/ui";
import type { MoneyAlert } from "@/lib/subscriptions";

/**
 * Today card for upcoming payments, trial ends, cooling-off ends and the
 * monthly savings balance. Same alerts as the notifications, so it also
 * covers Expo Go where notifications are off. Hidden when there is nothing.
 */
export function MoneyToday({ alerts, index }: { alerts: MoneyAlert[]; index: number }) {
  const t = useTheme();
  if (alerts.length === 0) return null;
  return (
    <Card title="À venir" icon="calendar" color="subs" index={index}>
      {alerts.map((a) => (
        <PressableScale
          key={a.key}
          accessibilityRole="link"
          accessibilityLabel={a.text}
          onPress={() => router.push(a.href)}
          style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 48 }}
        >
          <IconTile
            icon={a.href === "/modules/wishlist" ? "gift-outline" : a.tone === "warning" ? "hourglass-outline" : "card-outline"}
            color={a.href === "/modules/wishlist" ? "wish" : a.tone === "warning" ? "warning" : "subs"}
            size={36}
          />
          <View style={{ flex: 1 }}>
            <Txt variant="callout">{a.text}</Txt>
          </View>
          <Icon name="chevron-forward" size={18} color={t.textMuted} />
        </PressableScale>
      ))}
    </Card>
  );
}
