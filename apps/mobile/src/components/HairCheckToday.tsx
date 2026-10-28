import { View } from "react-native";
import Animated from "react-native-reanimated";
import { router } from "expo-router";
import { elevation, entering, Icon, IconTile, PressableScale, radius, space, Txt, useTheme } from "@/components/ui";
import { shortFrDate } from "@/lib/dates";
import type { HairState } from "@/lib/hairChecks";
import { ZONES } from "@/lib/hairPhotos";

/** What the monthly photo check needs now, or null when nothing is due. */
export function hairCheckStatus(state: HairState): { title: string; text: string } | null {
  if (state.open) {
    return {
      title: "Check photo à terminer",
      text: `Commencé le ${shortFrDate(state.open.day)} · ${state.open.photos.length}/${ZONES.length} zones`,
    };
  }
  if (state.overdue === null) return null;
  if (!state.lastDay) return { title: "Check photo du mois", text: "Premier check : 4 photos pour suivre l'évolution." };
  return {
    title: "Check photo du mois",
    text: state.overdue === 0 ? "À faire aujourd'hui." : `En retard de ${state.overdue} jour${state.overdue > 1 ? "s" : ""}.`,
  };
}

/**
 * Today banner for the monthly photo check. It mirrors the notification, so
 * it also covers Expo Go, where notifications are off. Hidden when not due.
 */
export function HairCheckToday({ state, index }: { state: HairState | null; index: number }) {
  const t = useTheme();
  const status = state ? hairCheckStatus(state) : null;
  if (!status) return null;
  return (
    <Animated.View entering={entering(index)}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${status.title}. ${status.text}`}
        onPress={() => router.push("/hair-check")}
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            gap: space.md,
            padding: space.lg,
            borderRadius: radius.lg,
            backgroundColor: t.surface,
            borderWidth: t.dark ? 1 : 0,
            borderColor: t.border,
          },
          elevation(t),
        ]}
      >
        <IconTile icon="camera" color="care" />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="bodyStrong">{status.title}</Txt>
          <Txt variant="caption" tone={state?.overdue ? "warning" : "muted"}>
            {status.text}
          </Txt>
        </View>
        <Icon name="chevron-forward" size={18} color={t.textMuted} />
      </PressableScale>
    </Animated.View>
  );
}
