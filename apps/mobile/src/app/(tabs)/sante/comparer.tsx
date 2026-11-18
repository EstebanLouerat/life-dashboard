import { useCallback, useState } from "react";
import { Image, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Card, Chips, Notice, radius, Screen, space, Txt } from "@/components/ui";
import { CompareSlider } from "@/components/CompareSlider";
import { atLocalTime } from "@/lib/dates";
import { loadHairState, type HairPhoto } from "@/lib/hairChecks";
import { byZone, compareBrightness, ZONE_LABEL, ZONES, type Zone } from "@/lib/hairPhotos";

const label = (day: string) => atLocalTime(day, 12).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });

/** Before / after of one zone: the first photo against the chosen one by default. */
export default function HairCompareScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ zone: string; after?: string }>();
  const zone: Zone = (ZONES as readonly string[]).includes(params.zone) ? (params.zone as Zone) : "frontal";
  const [photos, setPhotos] = useState<HairPhoto[]>([]);
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadHairState(db).then((s) => {
        const list = byZone(s.photos)[zone];
        setPhotos(list);
        if (list.length === 0) return;
        const requested = list.find((p) => String(p.id) === params.after);
        const after = requested && requested.id !== list[0].id ? requested : list[list.length - 1];
        setBeforeId((current) => current ?? String(list[0].id));
        setAfterId((current) => current ?? String(after.id));
      });
    }, [db, zone, params.after]),
  );

  const before = photos.find((p) => String(p.id) === beforeId);
  const after = photos.find((p) => String(p.id) === afterId);
  const options = photos.map((p) => ({ value: String(p.id), label: label(p.day) }));
  const light = before && after && before.id !== after.id ? compareBrightness(after, before) : null;

  return (
    <Screen back title={ZONE_LABEL[zone]} subtitle={photos.length > 1 ? "Glisse la séparation pour comparer" : undefined}>
      {photos.length === 1 && before ? (
        <>
          <Image source={{ uri: before.uri }} resizeMode="cover" style={{ width: "100%", aspectRatio: before.width / before.height, borderRadius: radius.lg }} />
          <Txt tone="muted">Une deuxième photo de cette zone, au prochain check, permettra la comparaison.</Txt>
        </>
      ) : null}

      {before && after && photos.length > 1 ? (
        <>
          <CompareSlider
            before={before.uri}
            after={after.uri}
            beforeLabel={`Avant · ${label(before.day)}`}
            afterLabel={`Après · ${label(after.day)}`}
            aspect={after.width / after.height}
          />
          {light && !light.ok ? (
            <Notice tone="warning">La lumière diffère entre ces deux photos : une partie de l'écart peut venir de l'éclairage.</Notice>
          ) : null}
          <Card index={1}>
            <View style={{ gap: space.sm }}>
              <Txt variant="caption" tone="muted">
                Avant
              </Txt>
              <Chips options={options} value={beforeId ?? ""} onChange={setBeforeId} />
            </View>
            <View style={{ gap: space.sm }}>
              <Txt variant="caption" tone="muted">
                Après
              </Txt>
              <Chips options={options} value={afterId ?? ""} onChange={setAfterId} />
            </View>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
