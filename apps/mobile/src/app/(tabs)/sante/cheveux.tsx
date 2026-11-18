import { useCallback, useState } from "react";
import { Image, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  Button,
  Card,
  Chips,
  EmptyState,
  Icon,
  ListRow,
  LocalBadge,
  PressableScale,
  radius,
  Screen,
  SkeletonCard,
  space,
  Txt,
  useTheme,
} from "@/components/ui";
import { atLocalTime, formatFrDate, shortFrDate } from "@/lib/dates";
import { loadHairState, type HairState } from "@/lib/hairChecks";
import { byZone, ZONE_LABEL, ZONES, type Zone } from "@/lib/hairPhotos";
import { loadTreatments, stockShort, type TreatmentState } from "@/lib/treatments";

const month = (day: string) => atLocalTime(day, 12).toLocaleDateString("fr-FR", { month: "short" });

/**
 * The hair follow-up: the monthly guided series, a timeline per zone (the
 * last six photos, tap one to compare it with the first) and the treatments
 * followed alongside. It compares photos taken in the same conditions; it
 * gives no medical opinion.
 */
export default function HairFollowScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const [state, setState] = useState<HairState | null>(null);
  const [treatments, setTreatments] = useState<TreatmentState[]>([]);
  const [zone, setZone] = useState<Zone>("frontal");

  useFocusEffect(
    useCallback(() => {
      loadHairState(db).then(setState);
      loadTreatments(db).then(setTreatments);
    }, [db]),
  );

  const compare = (after?: number) =>
    router.push({ pathname: "/sante/comparer", params: after ? { zone, after: String(after) } : { zone } });

  if (!state) {
    return (
      <Screen back title="Cheveux" subtitle="Suivi photo · mensuel" domain="sante">
        <SkeletonCard />
      </Screen>
    );
  }

  const photos = byZone(state.photos)[zone].slice(-6);
  const notes = state.checks.filter((c) => c.completedAt && (c.notes || c.sideEffects));

  return (
    <Screen back title="Cheveux" subtitle="Suivi photo · mensuel" domain="sante">
      <LocalBadge />
      <Card title="Série mensuelle" right={state.open ? "en cours" : `prochaine : ${shortFrDate(state.due)}`} index={0}>
        <Txt variant="callout" tone="muted">
          {ZONES.length} zones guidées · environ 2 min. Calque fantôme de la série précédente, niveau et alerte de lumière.
        </Txt>
        <Button
          variant={state.overdue !== null || state.open ? "primary" : "soft"}
          icon="camera-outline"
          label={state.open ? `Reprendre (${state.open.photos.length} / ${ZONES.length})` : "Prendre les photos"}
          onPress={() => router.push("/hair-check")}
        />
      </Card>

      <Card title="Frise" right={`${photos.length} mois`} index={1}>
        <Chips scroll options={ZONES.map((z) => ({ value: z, label: ZONE_LABEL[z] }))} value={zone} onChange={setZone} />
        {photos.length === 0 ? (
          <EmptyState icon="images-outline" title="Pas encore de photo" body="La frise se remplit à chaque série mensuelle." />
        ) : (
          <View style={{ flexDirection: "row", gap: 6 }}>
            {photos.map((p) => (
              <PressableScale
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={`${ZONE_LABEL[zone]}, ${formatFrDate(p.day)}. Comparer avec la première`}
                onPress={() => compare(p.id)}
                style={{ flex: 1, gap: 4, alignItems: "center", maxWidth: "17%" }}
              >
                <Image
                  source={{ uri: p.thumbUri }}
                  resizeMode="cover"
                  style={{ width: "100%", aspectRatio: 0.8, borderRadius: radius.sm, backgroundColor: t.surfaceAlt }}
                />
                <Txt variant="caption" tone="muted">
                  {month(p.day)}
                </Txt>
              </PressableScale>
            ))}
          </View>
        )}
        <Button variant="outline" icon="git-compare-outline" label="Comparer avant / après" disabled={photos.length < 2} onPress={() => compare()} />
      </Card>

      {treatments.length ? (
        <Card title="Traitements suivis" index={2} style={{ gap: 0 }}>
          {treatments.map((s) => (
            <ListRow
              key={s.treatment.id}
              icon="medkit-outline"
              title={s.treatment.name}
              subtitle={[stockShort(s), s.forecast.runOutOn ? `fin estimée ${shortFrDate(s.forecast.runOutOn)}` : null].filter(Boolean).join(" · ") || "Stock non renseigné"}
              onPress={() => router.push({ pathname: "/sante/traitements/[id]", params: { id: String(s.treatment.id) } })}
            />
          ))}
        </Card>
      ) : null}

      {notes.length ? (
        <Card title="Notes des séries" index={3}>
          {notes.map((c) => (
            <View key={c.id} style={{ gap: 2 }}>
              <Txt variant="bodyStrong">{formatFrDate(c.day)}</Txt>
              {c.notes ? <Txt variant="callout">{c.notes}</Txt> : null}
              {c.sideEffects ? (
                <Txt variant="callout" tone="muted">
                  Effets secondaires : {c.sideEffects}
                </Txt>
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", gap: space.sm, paddingHorizontal: space.xs }}>
        <Icon name="information-circle-outline" size={16} color={t.textMuted} />
        <Txt variant="caption" tone="muted" style={{ flex: 1 }}>
          Le suivi compare des photos prises dans les mêmes conditions. Il ne donne aucun avis médical.
        </Txt>
      </View>
    </Screen>
  );
}
