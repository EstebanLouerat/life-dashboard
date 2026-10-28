import { useCallback, useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import { Rpe, WorkoutSession, type SessionFeedback, type WorkoutRequest } from "@ld/contracts";
import { Body, Button, Card, Chips, Field, Screen, useTheme } from "@/components/ui";
import { api } from "@/lib/api";
import { today } from "@/lib/dates";

const RPE_LABEL: Record<Rpe, string> = {
  "trop-facile": "Trop facile",
  ok: "OK",
  dur: "Dur",
  "trop-dur": "Trop dur",
};

type Focus = WorkoutRequest["focus"];

export default function SportScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const [focus, setFocus] = useState<Focus>("mixte");
  const [minutes, setMinutes] = useState("10");
  const [level, setLevel] = useState("");
  const [constraints, setConstraints] = useState("");
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<{ id: number; data: WorkoutSession; rpe: Rpe | null } | null>(null);

  const loadToday = useCallback(async () => {
    const row = await db.getFirstAsync<{ id: number; session_json: string; rpe: string | null }>(
      "SELECT id, session_json, rpe FROM workout_sessions WHERE day = ? ORDER BY id DESC LIMIT 1",
      today(),
    );
    if (row) {
      setSession({
        id: row.id,
        data: WorkoutSession.parse(JSON.parse(row.session_json)),
        rpe: row.rpe ? Rpe.parse(row.rpe) : null,
      });
    }
  }, [db]);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  const generate = async () => {
    const rows = await db.getAllAsync<{ day: string; rpe: string; note: string | null }>(
      "SELECT day, rpe, note FROM workout_sessions WHERE rpe IS NOT NULL ORDER BY id DESC LIMIT 7",
    );
    const history: SessionFeedback[] = rows.map((r) => ({
      date: r.day,
      rpe: Rpe.parse(r.rpe),
      note: r.note ?? undefined,
    }));
    const input: WorkoutRequest = {
      minutes: Math.min(30, Math.max(5, Number(minutes) || 10)),
      focus,
      level: level || undefined,
      constraints: constraints || undefined,
      history,
    };

    setLoading(true);
    try {
      const data = await api.workout(input);
      const res = await db.runAsync(
        "INSERT INTO workout_sessions (day, session_json) VALUES (?, ?)",
        today(),
        JSON.stringify(data),
      );
      setSession({ id: res.lastInsertRowId, data, rpe: null });
    } catch (e) {
      Alert.alert("Génération impossible", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const rate = async (rpe: Rpe) => {
    if (!session) return;
    await db.runAsync("UPDATE workout_sessions SET rpe = ? WHERE id = ?", rpe, session.id);
    setSession({ ...session, rpe });
  };

  return (
    <Screen>
      <Card title="Séance du jour">
        <Chips
          value={focus}
          onChange={setFocus}
          options={[
            { value: "mixte", label: "Mixte" },
            { value: "mobilite", label: "Mobilité" },
            { value: "renfo", label: "Renfo" },
          ]}
        />
        <Field label="Durée (min)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
        <Field label="Niveau actuel (facultatif)" value={level} onChangeText={setLevel} placeholder="ex. 8 pompes, mains au sol jambes tendues" />
        <Field label="Douleurs / contraintes" value={constraints} onChangeText={setConstraints} placeholder="ex. poignet gauche sensible" />
        <Button label={session ? "Nouvelle séance" : "Générer ma séance"} onPress={generate} loading={loading} />
      </Card>

      {session ? (
        <>
          <Card title={`${session.data.title} · ${session.data.totalMinutes} min`}>
            <Body muted>{session.data.progressionNote}</Body>
            {session.data.exercises.map((ex, i) => (
              <View key={i} style={{ gap: 2, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: t.border }}>
                <Text style={{ color: t.text, fontWeight: "700" }}>
                  {ex.name} · {ex.sets} × {ex.reps != null ? `${ex.reps} reps` : `${ex.seconds} s`}
                </Text>
                <Body muted>{ex.cue}</Body>
                {ex.capoeiraLink ? <Body muted>↳ {ex.capoeiraLink}</Body> : null}
              </View>
            ))}
          </Card>

          <Card title="Ressenti">
            <Body muted>Ton retour ajuste la prochaine séance.</Body>
            <Chips
              value={session.rpe ?? ("" as Rpe)}
              onChange={rate}
              options={Rpe.options.map((r) => ({ value: r, label: RPE_LABEL[r] }))}
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
