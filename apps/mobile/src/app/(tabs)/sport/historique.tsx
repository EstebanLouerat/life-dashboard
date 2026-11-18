import { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Rpe, WorkoutSession } from "@ld/contracts";
import { Badge, Card, EmptyState, Screen, space, Txt } from "@/components/ui";
import { atLocalTime } from "@/lib/dates";
import { RPE_LABEL } from "./index";

type Row = { id: number; day: string; title: string; minutes: number; exercises: number; rpe: Rpe | null };

/** The last 7 sessions and how they felt (the feedback drives the next one). */
export default function HistoryScreen() {
  const db = useSQLiteContext();
  const [rows, setRows] = useState<Row[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      db.getAllAsync<{ id: number; day: string; session_json: string; rpe: string | null }>(
        "SELECT id, day, session_json, rpe FROM workout_sessions ORDER BY day DESC, id DESC LIMIT 7",
      ).then((list) =>
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
              },
            ];
          }),
        ),
      );
    }, [db]),
  );

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
              <View
                key={r.id}
                accessible
                accessibilityLabel={`${date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}, ${r.title}, ${r.minutes} minutes, ${r.rpe ? RPE_LABEL[r.rpe] : "ressenti non noté"}`}
                style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56 }}
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
              </View>
            );
          })}
        </Card>
      ) : null}
      <Txt variant="caption" tone="muted" style={{ paddingHorizontal: space.xs }}>
        Le ressenti sert uniquement à ajuster la séance suivante.
      </Txt>
    </Screen>
  );
}
