import { useCallback, useState } from "react";
import { Alert, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Button, Card, Icon, Notice, PressableScale, Screen, space, Txt, useTheme, type IconName } from "@/components/ui";
import { shortFrDate } from "@/lib/dates";
import { discardCheck, loadHairState, startCheck, type HairState } from "@/lib/hairChecks";
import { haptics } from "@/lib/haptics";
import { ZONES } from "@/lib/hairPhotos";

/** What makes two months comparable. Every box is ticked before the camera opens. */
const CHECKLIST: { key: string; icon: IconName; title: string; body: string }[] = [
  { key: "dry", icon: "sunny-outline", title: "Cheveux secs", body: "Coiffés comme d'habitude, sans produit qui les mouille." },
  { key: "room", icon: "bulb-outline", title: "Même pièce, même lampe", body: "Celles de la dernière fois, lumière allumée, volets pareils." },
  { key: "flash", icon: "flash-off-outline", title: "Flash éteint", body: "L'app ne l'allume pas ; évite aussi un miroir derrière toi." },
  { key: "distance", icon: "resize-outline", title: "Même distance", body: "Le cadre et la photo précédente en transparence t'aident à te replacer." },
];

export default function HairCheckPrepareScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const [state, setState] = useState<HairState | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadHairState(db).then(setState);
    }, [db]),
  );

  const toggle = (key: string) => {
    haptics.tap();
    const next = new Set(ticked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setTicked(next);
  };

  const start = async () => {
    setStarting(true);
    try {
      const id = await startCheck(db);
      router.replace({ pathname: "/hair-check/camera", params: { check: String(id) } });
    } finally {
      setStarting(false);
    }
  };

  const abandon = () => {
    if (!state?.open) return;
    const open = state.open;
    Alert.alert("Abandonner ce check ?", "Ses photos sont supprimées du téléphone.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Abandonner",
        style: "destructive",
        onPress: async () => {
          await discardCheck(db, open.id);
          setState(await loadHairState(db));
        },
      },
    ]);
  };

  const ready = ticked.size === CHECKLIST.length;
  const open = state?.open ?? null;

  return (
    <Screen back domain="sante" title="Check photo" subtitle="4 zones, dans les mêmes conditions chaque mois">
      {open ? (
        <Card title="Check en cours" subtitle={`Commencé le ${shortFrDate(open.day)} · ${open.photos.length}/${ZONES.length} zones`} icon="camera" color="sante" index={0}>
          <Button size="sm" variant="ghost" icon="trash-outline" label="Abandonner ce check" onPress={abandon} />
        </Card>
      ) : null}

      <Card title="Avant les photos" icon="checkbox-outline" color="sante" index={1}>
        {CHECKLIST.map((item) => {
          const done = ticked.has(item.key);
          return (
            <PressableScale
              key={item.key}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              accessibilityLabel={`${item.title}. ${item.body}`}
              onPress={() => toggle(item.key)}
              style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56 }}
            >
              <Icon name={item.icon} size={22} color={t.domain.sante.accentText} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="bodyStrong">{item.title}</Txt>
                <Txt variant="caption" tone="muted">
                  {item.body}
                </Txt>
              </View>
              <Icon name={done ? "checkmark-circle" : "ellipse-outline"} size={28} color={done ? t.domain.sante.accentText : t.textMuted} />
            </PressableScale>
          );
        })}
      </Card>

      <Notice tone="info">Les photos restent sur ce téléphone, dans le dossier privé de l'app : ni galerie, ni sauvegarde Google.</Notice>

      <Button
        label={open ? "Reprendre le check" : "Commencer"}
        icon="camera-outline"
        onPress={start}
        loading={starting}
        disabled={!ready}
      />
      {!ready ? (
        <Txt variant="caption" tone="muted" style={{ textAlign: "center" }}>
          Coche les {CHECKLIST.length - ticked.size} point{CHECKLIST.length - ticked.size > 1 ? "s" : ""} restant{CHECKLIST.length - ticked.size > 1 ? "s" : ""} pour ouvrir la caméra.
        </Txt>
      ) : null}
    </Screen>
  );
}
