import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { router } from "expo-router";
import { DomainScope, GlassSpecular, glassShadow, IconButton, IconTile, space, timing, Txt, useTheme } from "@/components/ui";
import { useWorkoutRunner } from "@/components/WorkoutRunner";
import { clock } from "@/lib/workoutTimeline";

/**
 * The session in progress, visible from every tab: just above the tab bar,
 * or beside its round button once the bar has shrunk. Tap to reopen the
 * timer; pause and next work in place.
 */
export function SessionAccessory({ collapsed }: { collapsed: boolean }) {
  const t = useTheme();
  const { run, remaining, togglePause, next } = useWorkoutRunner();
  const c = useSharedValue(collapsed ? 1 : 0);
  useEffect(() => {
    c.value = withTiming(collapsed ? 1 : 0, timing.slide);
  }, [collapsed, c]);
  // Collapsed: slides down beside the 56 px round button that replaces the bar.
  const style = useAnimatedStyle(() => ({
    marginLeft: c.value * 64,
    height: 52 + c.value * 4,
    transform: [{ translateY: c.value * 68 }],
  }));

  if (!run) return null;
  const step = run.steps[run.index];
  const exercise = run.session.exercises[step.exercise];
  const position = `${step.exercise + 1} / ${run.session.exercises.length}`;
  const status = run.finished
    ? "Séance terminée"
    : step.kind === "rest"
      ? `Repos ${clock(remaining)} · ${position}`
      : step.seconds != null
        ? `${clock(remaining)} · ${position}`
        : `${step.reps ?? ""} répétitions · ${position}`;

  return (
    <DomainScope domain="sport">
      <Animated.View style={[{ borderRadius: 28, backgroundColor: t.glass }, glassShadow(t), style]}>
        <GlassSpecular radius={28} />
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, paddingLeft: space.sm, paddingRight: 4 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={run.finished ? "Séance terminée, noter le ressenti" : `Séance en cours : ${exercise.name}, ${status}. Ouvrir le minuteur`}
            onPress={() => router.push(run.finished ? "/seance/ressenti" : "/seance")}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space.md, alignSelf: "stretch" }}
          >
            <IconTile icon={run.finished ? "checkmark" : "pulse"} size={36} />
            <View style={{ flex: 1 }}>
              <Txt variant="caption" tone="muted" numberOfLines={1}>
                {run.finished ? run.session.title : exercise.name}
              </Txt>
              <Txt variant="bodyStrong" numberOfLines={1} style={{ fontVariant: ["tabular-nums"] }}>
                {status}
              </Txt>
            </View>
          </Pressable>
          {run.finished ? (
            <IconButton icon="chevron-forward" variant="lens" label="Noter le ressenti" onPress={() => router.push("/seance/ressenti")} />
          ) : (
            <>
              <IconButton icon={run.paused ? "play" : "pause"} variant="lens" label={run.paused ? "Reprendre" : "Pause"} onPress={togglePause} />
              <IconButton icon="play-skip-forward" variant="lens" label="Étape suivante" onPress={next} />
            </>
          )}
        </View>
      </Animated.View>
    </DomainScope>
  );
}
