import { useCallback, useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import { Rpe, WorkoutSession, type SessionFeedback, type WorkoutRequest } from "@ld/contracts";
import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  Icon,
  radius,
  Screen,
  Segmented,
  space,
  Txt,
  useTheme,
} from "@/components/ui";
import { api } from "@/lib/api";
import { today } from "@/lib/dates";
import { haptics } from "@/lib/haptics";

const RPE_LABEL: Record<Rpe, string> = {
  "trop-facile": "Facile",
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
      haptics.success();
    } catch (e) {
      haptics.warning();
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
    <Screen back title="Sport" subtitle="Mobilité capoeira et renfo au poids du corps">
      <Card title="Séance du jour" icon="barbell" color="sport" index={0}>
        <Segmented
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
        <Field label="Douleurs ou contraintes" value={constraints} onChangeText={setConstraints} placeholder="ex. poignet gauche sensible" />
        <Button label={session ? "Nouvelle séance" : "Générer ma séance"} icon="flash" onPress={generate} loading={loading} />
      </Card>

      {session ? (
        <>
          <Card
            title={session.data.title}
            icon="list"
            color="sport"
            index={1}
            right={<Badge label={`${session.data.totalMinutes} min`} icon="time-outline" color="sport" />}
          >
            <Txt variant="callout" tone="muted">
              {session.data.progressionNote}
            </Txt>
            {session.data.exercises.map((ex, i) => (
              <View key={i} style={{ gap: space.md }}>
                {i ? <Divider /> : null}
                <View style={{ flexDirection: "row", gap: space.md }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: radius.pill,
                      backgroundColor: t.module.sport.soft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Txt variant="caption" color={t.module.sport.solid}>
                      {i + 1}
                    </Txt>
                  </View>
                  <View style={{ flex: 1, gap: space.xs }}>
                    <Txt variant="bodyStrong">{ex.name}</Txt>
                    <Badge
                      label={`${ex.sets} × ${ex.reps != null ? `${ex.reps} reps` : `${ex.seconds} s`}`}
                      color="sport"
                    />
                    <Txt variant="callout" tone="muted">
                      {ex.cue}
                    </Txt>
                    {ex.capoeiraLink ? (
                      <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
                        <Icon name="git-branch-outline" size={16} color={t.module.sport.solid} />
                        <Txt variant="caption" tone="muted" style={{ flex: 1 }}>
                          {ex.capoeiraLink}
                        </Txt>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
          </Card>

          <Card title="Ressenti" subtitle="Ton retour ajuste la prochaine séance." icon="pulse" color="sport" index={2}>
            <Segmented
              value={session.rpe}
              onChange={rate}
              options={Rpe.options.map((r) => ({ value: r, label: RPE_LABEL[r] }))}
            />
          </Card>
        </>
      ) : (
        <Card index={1}>
          <EmptyState icon="barbell-outline" title="Pas encore de séance" body="Choisis un focus et une durée, puis génère ta séance du jour." />
        </Card>
      )}
    </Screen>
  );
}
