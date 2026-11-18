import { useCallback, useEffect, useState } from "react";
import { Image } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Card, Chips, EmptyState, ListRow, LocalBadge, Notice, radius, Screen, Sheet, Txt } from "@/components/ui";
import { CompareSlider } from "@/components/CompareSlider";
import { atLocalTime } from "@/lib/dates";
import { loadHairState, type HairPhoto } from "@/lib/hairChecks";
import { byZone, compareBrightness, ZONE_LABEL, ZONES, type Zone } from "@/lib/hairPhotos";

const short = (day: string) => atLocalTime(day, 12).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
const long = (day: string) => atLocalTime(day, 12).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** Before / after of one zone: the first photo against the chosen one by default. */
export default function HairCompareScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ zone?: string; after?: string }>();
  const [zone, setZone] = useState<Zone>((ZONES as readonly string[]).includes(params.zone ?? "") ? (params.zone as Zone) : "frontal");
  const [all, setAll] = useState<HairPhoto[]>([]);
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);
  const [picking, setPicking] = useState<"before" | "after" | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadHairState(db).then((s) => setAll(s.photos));
    }, [db]),
  );

  const photos = byZone(all)[zone];

  // A new zone starts again from its first and last photos (or the one asked for).
  useEffect(() => {
    if (photos.length === 0) return;
    const requested = photos.find((p) => String(p.id) === params.after);
    const after = requested && requested.id !== photos[0].id ? requested : photos[photos.length - 1];
    setBeforeId(String(photos[0].id));
    setAfterId(String(after.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone, all.length]);

  const before = photos.find((p) => String(p.id) === beforeId);
  const after = photos.find((p) => String(p.id) === afterId);
  const options = photos.map((p) => ({ value: String(p.id), label: short(p.day) }));
  const light = before && after && before.id !== after.id ? compareBrightness(after, before) : null;

  return (
    <Screen back title="Comparer" subtitle={`Cheveux · ${ZONE_LABEL[zone].toLowerCase()}`} domain="sante">
      <LocalBadge />
      <Chips scroll options={ZONES.map((z) => ({ value: z, label: ZONE_LABEL[z] }))} value={zone} onChange={setZone} />

      {photos.length === 0 ? <EmptyState icon="images-outline" title="Pas de photo pour cette zone" body="Elle apparaîtra après la prochaine série." /> : null}

      {photos.length === 1 && before ? (
        <>
          <Image source={{ uri: before.uri }} resizeMode="cover" style={{ width: "100%", aspectRatio: before.width / before.height, borderRadius: radius.lg }} />
          <Txt tone="muted">Une deuxième photo de cette zone, à la prochaine série, permettra la comparaison.</Txt>
        </>
      ) : null}

      {before && after && photos.length > 1 ? (
        <>
          <CompareSlider
            before={before.uri}
            after={after.uri}
            beforeLabel={`Avant · ${short(before.day)}`}
            afterLabel={`Après · ${short(after.day)}`}
            aspect={after.width / after.height}
          />
          {light && !light.ok ? (
            <Notice tone="warning">La lumière diffère entre ces deux photos : une partie de l'écart peut venir de l'éclairage.</Notice>
          ) : null}
          <Card style={{ gap: 0 }}>
            <ListRow icon="image-outline" title="Avant" subtitle={long(before.day)} onPress={() => setPicking("before")} />
            <ListRow icon="image-outline" title="Après" subtitle={long(after.day)} onPress={() => setPicking("after")} />
          </Card>
        </>
      ) : null}

      <Sheet visible={!!picking} onClose={() => setPicking(null)} title={picking === "before" ? "Photo « avant »" : "Photo « après »"}>
        <Chips
          options={options}
          value={(picking === "before" ? beforeId : afterId) ?? ""}
          onChange={(v) => {
            if (picking === "before") setBeforeId(v);
            else setAfterId(v);
            setPicking(null);
          }}
        />
      </Sheet>
    </Screen>
  );
}
