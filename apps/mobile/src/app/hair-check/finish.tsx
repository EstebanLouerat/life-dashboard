import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Button, Card, Field, Icon, radius, Screen, space, Txt, useTheme } from "@/components/ui";
import { completeCheck, loadHairState, type HairCheck } from "@/lib/hairChecks";
import { haptics } from "@/lib/haptics";
import { ZONE_LABEL, ZONES } from "@/lib/hairPhotos";

/** Last step: what was shot, notes and side effects, then the check is closed. */
export default function HairCheckFinishScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const { check } = useLocalSearchParams<{ check: string }>();
  const checkId = Number(check);
  const [current, setCurrent] = useState<HairCheck | null>(null);
  const [notes, setNotes] = useState("");
  const [sideEffects, setSideEffects] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadHairState(db).then((s) => setCurrent(s.checks.find((c) => c.id === checkId) ?? null));
  }, [db, checkId]);

  const missing = current ? ZONES.filter((z) => !current.photos.some((p) => p.zone === z)) : [];

  const finish = async () => {
    setSaving(true);
    try {
      await completeCheck(db, checkId, notes, sideEffects);
      haptics.success();
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen back title="Dernière étape" subtitle="Ajoute ce que tu as remarqué ce mois-ci">
      <Card title="Photos" icon="images-outline" color="care" index={0}>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          {ZONES.map((z) => {
            const photo = current?.photos.find((p) => p.zone === z);
            return (
              <View key={z} style={{ flex: 1, gap: 4 }}>
                <View
                  style={{
                    aspectRatio: 3 / 4,
                    borderRadius: radius.sm,
                    overflow: "hidden",
                    backgroundColor: t.surfaceAlt,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {photo ? (
                    <Image source={{ uri: photo.thumbUri }} resizeMode="cover" style={{ width: "100%", height: "100%" }} accessibilityLabel={ZONE_LABEL[z]} />
                  ) : (
                    <Icon name="remove-circle-outline" size={20} color={t.textMuted} />
                  )}
                </View>
                <Txt variant="caption" tone={photo ? "default" : "muted"} numberOfLines={1} style={{ textAlign: "center" }}>
                  {ZONE_LABEL[z]}
                </Txt>
              </View>
            );
          })}
        </View>
        {missing.length ? (
          <Button
            size="sm"
            variant="secondary"
            icon="camera-outline"
            label={`Photographier ${missing.length > 1 ? `les ${missing.length} zones passées` : "la zone passée"}`}
            onPress={() => router.replace({ pathname: "/hair-check/camera", params: { check: String(checkId) } })}
          />
        ) : null}
      </Card>

      <Card title="Notes" icon="create-outline" color="primary" index={1}>
        <Field label="Observations" value={notes} onChangeText={setNotes} placeholder="Facultatif" multiline />
        <Field
          label="Effets secondaires"
          value={sideEffects}
          onChangeText={setSideEffects}
          placeholder="Facultatif"
          helper="Ce que tu as ressenti depuis le dernier check, ou rien."
          multiline
        />
      </Card>

      <Button label="Terminer le check" icon="checkmark" onPress={finish} loading={saving} />
    </Screen>
  );
}
