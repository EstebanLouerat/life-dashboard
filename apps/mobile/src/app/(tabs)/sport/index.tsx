import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Rpe, WorkoutSession, type SessionFeedback, type WorkoutRequest } from "@ld/contracts";
import {
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  ListRow,
  Notice,
  Screen,
  SectionTitle,
  Segmented,
  Sheet,
  SkeletonCard,
  space,
  Stepper,
  Txt,
  useTheme,
} from "@/components/ui";
import { useWorkoutRunner } from "@/components/WorkoutRunner";
import { api } from "@/lib/api";
import { today } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
import { groupBlocks, RPE_LABEL, setsLabel } from "@/lib/workoutTimeline";

type Focus = WorkoutRequest["focus"];
type Session = { id: number; data: WorkoutSession; rpe: Rpe | null };

/**
 * Today's session by block, started in one tap into the guided timer.
 * A new session comes from Claude (header button) or from Importer.
 */
export default function SportScreen() {
  const db = useSQLiteContext();
  const runner = useWorkoutRunner();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [sheet, setSheet] = useState(false);
  const [focus, setFocus] = useState<Focus>("mixte");
  const [minutes, setMinutes] = useState(10);
  const [level, setLevel] = useState("");
  const [constraints, setConstraints] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadToday = useCallback(async () => {
    const row = await db.getFirstAsync<{ id: number; session_json: string; rpe: string | null }>(
      "SELECT id, session_json, rpe FROM workout_sessions WHERE day = ? ORDER BY id DESC LIMIT 1",
      today(),
    );
    const parsed = row ? WorkoutSession.safeParse(JSON.parse(row.session_json)) : null;
    setSession(row && parsed?.success ? { id: row.id, data: parsed.data, rpe: row.rpe ? Rpe.parse(row.rpe) : null } : null);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      loadToday();
    }, [loadToday]),
  );

  const generate = async () => {
    const rows = await db.getAllAsync<{ day: string; rpe: string; note: string | null }>(
      "SELECT day, rpe, note FROM workout_sessions WHERE rpe IS NOT NULL ORDER BY id DESC LIMIT 7",
    );
    const history: SessionFeedback[] = rows.map((r) => ({ date: r.day, rpe: Rpe.parse(r.rpe), note: r.note ?? undefined }));
    const input: WorkoutRequest = {
      minutes,
      focus,
      level: level.trim() || undefined,
      constraints: constraints.trim() || undefined,
      history,
    };
    setLoading(true);
    setError(null);
    try {
      const data = await api.workout(input);
      const res = await db.runAsync("INSERT INTO workout_sessions (day, session_json) VALUES (?, ?)", today(), JSON.stringify(data));
      setSession({ id: res.lastInsertRowId, data, rpe: null });
      setSheet(false);
      haptics.success();
    } catch (e) {
      haptics.warning();
      setSheet(false);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const start = () => {
    if (!session) return;
    runner.start(session.id, session.data);
    router.push("/seance");
  };

  const live = runner.run && session && runner.run.sessionId === session.id && !runner.run.finished;
  const date = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <Screen
      title="Sport"
      subtitle={date.charAt(0).toUpperCase() + date.slice(1)}
      domain="sport"
      right={<IconButton icon="sparkles-outline" label="Générer une nouvelle séance" onPress={() => setSheet(true)} />}
    >
      {error ? (
        <Notice tone="danger" title="Serveur injoignable" action={{ label: "Réessayer", onPress: generate }}>
          {session ? "La séance déjà enregistrée reste affichée." : "Aucune séance générée."} {error}
        </Notice>
      ) : null}

      {session === undefined ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : session ? (
        <SessionView session={session} live={!!live} onStart={start} />
      ) : (
        <EmptyState
          icon="pulse-outline"
          title="Pas de séance aujourd'hui"
          body="Demande une séance à Claude (5 à 30 min), puis importe-la."
          action={{ label: "Importer une séance", onPress: () => router.push({ pathname: "/plus/importer", params: { type: "seance" } }) }}
          secondary={{ label: "Générer", onPress: () => setSheet(true) }}
        />
      )}

      <Card style={{ gap: 0 }}>
        <ListRow icon="time-outline" title="Historique" subtitle="7 dernières séances" onPress={() => router.push("/sport/historique")} />
      </Card>

      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Nouvelle séance" subtitle="Générée par Claude d'après tes 7 derniers ressentis">
        <View style={{ gap: space.md }}>
          <Segmented
            value={focus}
            onChange={setFocus}
            options={[
              { value: "mixte", label: "Mixte" },
              { value: "mobilite", label: "Mobilité" },
              { value: "renfo", label: "Renfo" },
            ]}
          />
          <Stepper
            label="Durée"
            value={`${minutes} min`}
            canDecrement={minutes > 5}
            canIncrement={minutes < 30}
            onDecrement={() => setMinutes((m) => Math.max(5, m - 5))}
            onIncrement={() => setMinutes((m) => Math.min(30, m + 5))}
          />
          <Field label="Niveau actuel (facultatif)" value={level} onChangeText={setLevel} placeholder="ex. 8 pompes, mains au sol jambes tendues" />
          <Field label="Douleurs ou contraintes" value={constraints} onChangeText={setConstraints} placeholder="ex. poignet gauche sensible" />
          <View style={{ flexDirection: "row", gap: space.md }}>
            <Button label="Annuler" variant="outline" style={{ flex: 1 }} onPress={() => setSheet(false)} />
            <Button label="Générer" icon="sparkles-outline" style={{ flex: 1 }} loading={loading} onPress={generate} />
          </View>
        </View>
      </Sheet>
    </Screen>
  );
}

function SessionView({ session, live, onStart }: { session: Session; live: boolean; onStart: () => void }) {
  const t = useTheme();
  const blocks = groupBlocks(session.data.exercises);
  return (
    <>
      <Card>
        <View style={{ gap: 2 }}>
          <Txt variant="overline" tone="accent">
            Séance du jour
          </Txt>
          <Txt variant="headline">{session.data.title}</Txt>
          <Txt variant="callout" tone="muted">
            {session.data.totalMinutes} min · {session.data.exercises.length} exercices · sans matériel
          </Txt>
        </View>
        {session.data.progressionNote ? (
          <Txt variant="caption" tone="muted">
            {session.data.progressionNote}
          </Txt>
        ) : null}
        {session.rpe && !live ? (
          <Txt variant="label" tone="accent">
            Faite · ressenti : {RPE_LABEL[session.rpe]}
          </Txt>
        ) : null}
        <Button
          label={live ? "Reprendre" : session.rpe ? "Refaire la séance" : "Commencer"}
          icon="play"
          variant={session.rpe && !live ? "soft" : "primary"}
          onPress={onStart}
        />
      </Card>

      {blocks.map((b, bi) => (
        <View key={b.block} style={{ gap: space.md }}>
          <SectionTitle right={`≈ ${b.minutes} min`}>{b.label}</SectionTitle>
          <Card index={bi + 1} style={{ gap: space.lg }}>
            {b.exercises.map(({ index, exercise: ex }) => (
              <View key={index} style={{ flexDirection: "row", gap: space.md }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: t.surfaceAlt,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Txt variant="caption" tone="muted">
                    {index + 1}
                  </Txt>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="bodyStrong">{ex.name}</Txt>
                  <Txt variant="callout" tone="muted">
                    {ex.cue}
                  </Txt>
                  {ex.capoeiraLink ? (
                    <Txt variant="caption" tone="accent">
                      Capoeira : {ex.capoeiraLink}
                    </Txt>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Txt variant="bodyStrong" style={{ fontVariant: ["tabular-nums"] }}>
                    {setsLabel(ex)}
                  </Txt>
                  {ex.restSeconds ? (
                    <Txt variant="caption" tone="muted">
                      repos {ex.restSeconds} s
                    </Txt>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        </View>
      ))}
    </>
  );
}
