import { useCallback, useState } from "react";
import { Image, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Button, Card, EmptyState, PressableScale, radius, Screen, space, Txt, type IconName } from "@/components/ui";
import { formatFrDate, shortFrDate } from "@/lib/dates";
import { loadHairState, type HairState } from "@/lib/hairChecks";
import { byZone, ZONE_LABEL, ZONES, type Zone } from "@/lib/hairPhotos";

const ZONE_ICON: Record<Zone, IconName> = {
  frontal: "happy-outline",
  temples: "git-compare-outline",
  vertex: "radio-button-on-outline",
  top: "ellipse-outline",
};

/** Timeline: each zone's photos, oldest first, then the checks' notes. */
export default function HairPhotosScreen() {
  const db = useSQLiteContext();
  const [state, setState] = useState<HairState | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadHairState(db).then(setState);
    }, [db]),
  );

  if (!state) return <Screen back title="Photos" />;

  const groups = byZone(state.photos);
  const completed = state.checks.filter((c) => c.completedAt);
  const compare = (zone: Zone, after?: number) =>
    router.push({ pathname: "/modules/hair-care/compare", params: after ? { zone, after: String(after) } : { zone } });

  return (
    <Screen back title="Photos" subtitle={completed.length ? `${completed.length} check${completed.length > 1 ? "s" : ""} depuis le ${formatFrDate(completed[completed.length - 1].day)}` : "Un check par mois, 4 zones"}>
      {state.photos.length === 0 ? (
        <Card index={0}>
          <EmptyState icon="camera-outline" title="Aucune photo" body="Un check par mois, 4 zones : la timeline se remplit ici." />
          <Button label="Faire le premier check" icon="camera-outline" onPress={() => router.push("/hair-check")} />
        </Card>
      ) : null}

      {ZONES.filter((z) => groups[z].length).map((zone, i) => {
        const photos = groups[zone];
        return (
          <Card
            key={zone}
            title={ZONE_LABEL[zone]}
            subtitle={`${photos.length} photo${photos.length > 1 ? "s" : ""}`}
            icon={ZONE_ICON[zone]}
            color="care"
            index={i}
            right={photos.length > 1 ? <Button size="sm" variant="soft" icon="swap-horizontal" label="Comparer" onPress={() => compare(zone)} /> : undefined}
          >
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {photos.map((p) => (
                <PressableScale
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${ZONE_LABEL[zone]}, ${formatFrDate(p.day)}`}
                  onPress={() => compare(zone, p.id)}
                  style={{ width: "31%", gap: 4 }}
                >
                  <Image source={{ uri: p.thumbUri }} resizeMode="cover" style={{ width: "100%", aspectRatio: p.width / p.height, borderRadius: radius.sm }} />
                  <Txt variant="caption" tone="muted" style={{ textAlign: "center" }}>
                    {shortFrDate(p.day)}
                  </Txt>
                </PressableScale>
              ))}
            </View>
          </Card>
        );
      })}

      {completed.some((c) => c.notes || c.sideEffects) ? (
        <Card title="Notes des checks" icon="document-text-outline" color="primary" index={ZONES.length}>
          {completed
            .filter((c) => c.notes || c.sideEffects)
            .map((c) => (
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
    </Screen>
  );
}
