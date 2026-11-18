import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Rpe } from "@ld/contracts";
import { Button, Card, Chip, Field, Icon, Screen, space, Txt, useAccent } from "@/components/ui";
import { useWorkoutRunner } from "@/components/WorkoutRunner";
import { haptics } from "@/lib/haptics";
import { RPE_LABEL } from "@/lib/workoutTimeline";

/**
 * After the last step: how it felt (and an optional note) feeds the next
 * session Claude generates. "Passer" closes without noting.
 */
export default function FeedbackScreen() {
  const db = useSQLiteContext();
  const a = useAccent("sport");
  const { run, stop } = useWorkoutRunner();
  const [rpe, setRpe] = useState<Rpe | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = (to?: "/sport/historique") => {
    stop();
    router.dismissAll();
    if (to) router.navigate(to);
  };

  const save = async () => {
    if (!run) return close();
    if (!rpe) {
      haptics.warning();
      setError("Choisis comment c'était.");
      return;
    }
    await db.runAsync("UPDATE workout_sessions SET rpe = ?, note = ? WHERE id = ?", rpe, note.trim() || null, run.sessionId);
    haptics.success();
    close("/sport/historique");
  };

  return (
    <Screen domain="sport">
      <View style={{ alignItems: "center", gap: space.sm, paddingVertical: space.lg }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: a.surfaceAccent, alignItems: "center", justifyContent: "center" }}>
          <Icon name="checkmark" size={32} color={a.onAccentSoft} />
        </View>
        <Txt variant="title" accessibilityRole="header">
          Séance terminée
        </Txt>
        {run ? (
          <Txt variant="callout" tone="muted" style={{ textAlign: "center" }}>
            {run.session.title} · {run.session.totalMinutes} min
          </Txt>
        ) : null}
      </View>

      <Card title="Comment c'était ?">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }} accessibilityRole="radiogroup">
          {Rpe.options.map((r) => (
            <Chip
              key={r}
              label={RPE_LABEL[r]}
              active={rpe === r}
              style={{ flexBasis: "47%", flexGrow: 1 }}
              onPress={() => {
                haptics.tap();
                setRpe(r);
                setError(null);
              }}
            />
          ))}
        </View>
        {error ? (
          <Txt variant="caption" tone="danger">
            {error}
          </Txt>
        ) : null}
        <Field
          label="Note (facultatif)"
          value={note}
          onChangeText={setNote}
          maxLength={300}
          placeholder="ex. poignet gauche un peu raide sur les pompes"
          helper="Prise en compte pour la prochaine séance générée."
        />
      </Card>

      <View style={{ gap: space.xs, marginTop: space.lg }}>
        <Button label="Enregistrer" onPress={save} />
        <Button label="Passer" variant="ghost" onPress={() => close()} />
      </View>
    </Screen>
  );
}
