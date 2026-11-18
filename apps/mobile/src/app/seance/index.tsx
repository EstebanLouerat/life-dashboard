import { useEffect } from "react";
import { Alert, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  Button,
  Card,
  GlassSpecular,
  glassShadow,
  IconButton,
  ProgressBar,
  space,
  Txt,
  useAccent,
  useTheme,
  Wash,
} from "@/components/ui";
import { useWorkoutRunner } from "@/components/WorkoutRunner";
import { BLOCK_LABEL, clock, setsLabel } from "@/lib/workoutTimeline";

/**
 * Full-screen guided timer: one step at a time (a set, then its rest), the
 * clock in large figures, the cue, and what comes next. Timed steps move on
 * by themselves; a set counted in reps waits for "Série faite". Closing
 * keeps the session running in the accessory above the tab bar.
 */
export default function TimerScreen() {
  const t = useTheme();
  const a = useAccent("sport");
  const insets = useSafeAreaInsets();
  const { run, remaining, togglePause, next, previous, stop } = useWorkoutRunner();

  useEffect(() => {
    if (!run) router.back();
    else if (run.finished) router.replace("/seance/ressenti");
  }, [run]);

  if (!run || run.finished) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  const step = run.steps[run.index];
  const exercises = run.session.exercises;
  const ex = exercises[step.exercise];
  const rest = step.kind === "rest";
  const nextStep = run.steps[run.index + 1];
  const upcoming = nextStep && nextStep.exercise !== step.exercise ? exercises[nextStep.exercise] : null;
  const timed = step.seconds != null;
  const total = step.seconds ?? 0;

  const quit = () =>
    Alert.alert("Arrêter la séance ?", "Elle ne sera pas notée comme faite.", [
      { text: "Continuer", style: "cancel" },
      {
        text: "Arrêter",
        style: "destructive",
        onPress: () => {
          stop();
          router.back();
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top, paddingBottom: insets.bottom + space.xxl, gap: space.md }}>
      <Wash domain="sport" />
      <View style={{ flexDirection: "row", alignItems: "center", height: 52, paddingHorizontal: space.md }}>
        <IconButton icon="close" label="Fermer le minuteur (la séance continue)" onPress={() => router.back()} />
        <Txt variant="label" tone="muted" style={{ flex: 1, textAlign: "center" }}>
          Exercice {step.exercise + 1} / {exercises.length}
        </Txt>
        <IconButton icon="stop-outline" label="Arrêter la séance" onPress={quit} />
      </View>

      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", gap: 4, paddingHorizontal: space.xl }}>
        {exercises.map((_, i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step.exercise ? a.accent : t.surfaceAlt }} />
        ))}
      </View>

      <View style={{ flex: 1, justifyContent: "center", gap: space.sm, paddingHorizontal: space.lg }}>
        <Txt variant="overline" tone="accent" style={{ textAlign: "center" }}>
          {rest ? "Repos" : BLOCK_LABEL[ex.block]}
        </Txt>
        <Txt variant="title" accessibilityRole="header" style={{ textAlign: "center" }}>
          {rest ? (upcoming ? `Ensuite : ${upcoming.name}` : ex.name) : ex.name}
        </Txt>
        <Txt tone="muted" style={{ textAlign: "center" }}>
          Série {step.set} sur {step.sets}
          {rest ? " terminée" : ""}
        </Txt>
        <Txt
          variant="timer"
          accessibilityLiveRegion="polite"
          accessibilityLabel={timed ? `${Math.ceil(remaining)} secondes` : `${step.reps} répétitions`}
          style={{ textAlign: "center", marginTop: space.lg }}
        >
          {timed ? clock(remaining) : `× ${step.reps}`}
        </Txt>
        {timed ? (
          <>
            <View style={{ marginHorizontal: space.xxl }}>
              <ProgressBar value={total ? 1 - remaining / total : 0} label="Temps écoulé de l'étape" />
            </View>
            <Txt variant="caption" tone="muted" style={{ textAlign: "center" }}>
              reste {Math.ceil(remaining)} s sur {total}
              {run.paused ? " · en pause" : ""}
            </Txt>
          </>
        ) : (
          <Txt variant="caption" tone="muted" style={{ textAlign: "center" }}>
            À ton rythme, puis « Série faite »
          </Txt>
        )}
        {!rest && ex.cue ? (
          <Card style={{ marginTop: space.lg }}>
            <Txt variant="callout" tone="muted">
              {ex.cue}
            </Txt>
          </Card>
        ) : null}
      </View>

      {upcoming && !rest ? (
        <Card style={{ marginHorizontal: space.lg, padding: 14, gap: 0 }}>
          <Txt variant="overline" tone="muted">
            Ensuite
          </Txt>
          <Txt variant="bodyStrong">{upcoming.name}</Txt>
          <Txt variant="caption" tone="muted">
            {setsLabel(upcoming)}
            {ex.restSeconds ? ` · repos ${ex.restSeconds} s avant` : ""}
          </Txt>
        </Card>
      ) : null}

      <View
        style={[
          { marginHorizontal: space.lg, borderRadius: 40, padding: space.sm, flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: t.glass },
          glassShadow(t),
        ]}
      >
        <GlassSpecular radius={40} />
        <IconButton icon="play-skip-back" variant="lens" size={56} label="Étape précédente" disabled={run.index === 0} onPress={previous} />
        {timed ? (
          <Button
            label={run.paused ? "Reprendre" : "Pause"}
            icon={run.paused ? "play" : "pause"}
            style={{ flex: 1, minHeight: 56 }}
            onPress={togglePause}
          />
        ) : (
          <Button label="Série faite" icon="checkmark" style={{ flex: 1, minHeight: 56 }} onPress={next} />
        )}
        <IconButton icon="play-skip-forward" variant="lens" size={56} label="Passer à l'étape suivante" onPress={next} />
      </View>
    </View>
  );
}
