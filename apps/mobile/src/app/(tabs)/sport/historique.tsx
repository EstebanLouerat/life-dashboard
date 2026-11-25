import { useCallback, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Rpe, WorkoutSession } from "@ld/contracts";
import { Badge, Card, EmptyState, Screen, space, Swipeable, Txt, useActionSheet, useSnackbar } from "@/components/ui";
import { atLocalTime, today } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
import { RPE_LABEL } from "@/lib/workoutTimeline";

type Stored = { id: number; day: string; session_json: string; rpe: string | null; note: string | null };
type Row = { id: number; day: string; title: string; minutes: number; exercises: number; rpe: Rpe | null; stored: Stored };

/** The last 7 sessions and how they felt (the feedback drives the next one). */
export default function HistoryScreen() {
  const db = useSQLiteContext();
  const [rows, setRows] = useState<Row[] | null>(null);
  const snackbar = useSnackbar();
  const actions = useActionSheet();

  const load = useCallback(
    () =>
      db.getAllAsync<Stored>("SELECT id, day, session_json, rpe, note FROM workout_sessions ORDER BY day DESC, id DESC LIMIT 7").then((list) =>
        setRows(
          list.flatMap((r) => {
            const parsed = WorkoutSession.safeParse(JSON.parse(r.session_json));
            if (!parsed.success) return [];
            const rpe = Rpe.safeParse(r.rpe);
            return [
              {
                id: r.id,
                day: r.day,
                title: parsed.data.title,
                minutes: parsed.data.totalMinutes,
                exercises: parsed.data.exercises.length,
                rpe: rpe.success ? rpe.data : null,
                stored: r,
              },
            ];
          }),
        ),
      ),
    [db],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /** Deleted with undo: the row comes back with its id, feedback and note. */
  const remove = async (r: Row) => {
    haptics.impact();
    await db.runAsync("DELETE FROM workout_sessions WHERE id = ?", r.id);
    await load();
    snackbar.show({
      message: `Séance du ${atLocalTime(r.day, 12).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} supprimée`,
      undo: async () => {
        const s = r.stored;
        await db.runAsync("INSERT INTO workout_sessions (id, day, session_json, rpe, note) VALUES (?, ?, ?, ?, ?)", s.id, s.day, s.session_json, s.rpe, s.note);
        await load();
      },
    });
  };

  /** Today's session becomes a copy of this one (feedback not copied). */
  const redo = async (r: Row) => {
    haptics.success();
    await db.runAsync("INSERT INTO workout_sessions (day, session_json) VALUES (?, ?)", today(), r.stored.session_json);
    router.navigate("/sport");
  };

  const menu = (r: Row) =>
    actions.open(r.title, [
      { icon: "repeat-outline", label: "Refaire aujourd'hui", hint: "Devient la séance du jour", onPress: () => redo(r) },
      {
        icon: "trash-outline",
        label: "Supprimer",
        danger: true,
        onPress: () =>
          Alert.alert("Supprimer cette séance ?", "Son ressenti ne comptera plus pour la suivante.", [
            { text: "Annuler", style: "cancel" },
            { text: "Supprimer", style: "destructive", onPress: () => remove(r) },
          ]),
      },
    ]);

  return (
    <Screen back title="Historique" subtitle="7 dernières séances" domain="sport">
      {rows && rows.length === 0 ? (
        <EmptyState icon="time-outline" title="Aucune séance" body="Tes séances et ton ressenti apparaîtront ici." />
      ) : null}
      {rows && rows.length ? (
        <Card style={{ gap: space.xs }}>
          {rows.map((r) => {
            const date = atLocalTime(r.day, 12);
            return (
              <Swipeable
                key={r.id}
                style={{ marginHorizontal: -space.sm }}
                left={{ icon: "repeat-outline", label: "Refaire", onAction: () => redo(r) }}
                right={{ icon: "trash-outline", label: "Supprimer", danger: true, onAction: () => remove(r) }}
              >
                <Pressable
                  accessibilityLabel={`${date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}, ${r.title}, ${r.minutes} minutes, ${r.rpe ? RPE_LABEL[r.rpe] : "ressenti non noté"}`}
                  accessibilityHint="Appui long pour refaire ou supprimer"
                  onLongPress={() => menu(r)}
                  style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56, paddingHorizontal: space.sm }}
                >
                  <View style={{ width: 40, alignItems: "center" }}>
                    <Txt variant="overline" tone="muted" style={{ letterSpacing: 0.4 }}>
                      {date.toLocaleDateString("fr-FR", { weekday: "short" })}
                    </Txt>
                    <Txt variant="headline" style={{ fontVariant: ["tabular-nums"] }}>
                      {date.getDate()}
                    </Txt>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt numberOfLines={1}>{r.title}</Txt>
                    <Txt variant="caption" tone="muted">
                      {r.minutes} min · {r.exercises} exercices
                    </Txt>
                  </View>
                  <Badge color="neutral" label={r.rpe ? RPE_LABEL[r.rpe] : "Non noté"} />
                </Pressable>
              </Swipeable>
            );
          })}
        </Card>
      ) : null}
      <Txt variant="caption" tone="muted" style={{ paddingHorizontal: space.xs }}>
        Le ressenti sert uniquement à ajuster la séance suivante. Glisse une séance pour la refaire ou la supprimer.
      </Txt>
      {actions.sheet}
    </Screen>
  );
}
