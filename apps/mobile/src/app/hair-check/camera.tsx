import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import {
  Button,
  Icon,
  IconButton,
  Notice,
  popIn,
  radius,
  reveal,
  Screen,
  space,
  Txt,
  usePressScale,
  useTheme,
} from "@/components/ui";
import { LevelIndicator } from "@/components/LevelIndicator";
import { analyzeShot, discardShot, loadHairState, savePhoto, type HairState } from "@/lib/hairChecks";
import {
  compareBrightness,
  firstPhoto,
  previousPhoto,
  ZONE_LABEL,
  ZONE_SETUP,
  ZONES,
  type Brightness,
  type BrightnessCheck,
  type Zone,
} from "@/lib/hairPhotos";
import { haptics } from "@/lib/haptics";

type Phase = "aim" | "countdown" | "busy" | "review";
type Shot = { uri: string; width: number; height: number; brightness: Brightness; result: BrightnessCheck };

/** Last month's photo of the zone, shown over the preview to land on the same framing. */
const GHOST_OPACITY = 0.4;

/**
 * Guided camera, one zone after the other: frame, bubble level, last
 * month's photo as a ghost, a 10 s countdown with a buzz per second when the
 * screen is out of sight, then a review with the brightness check before
 * the photo is kept.
 */
export default function HairCameraScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { check } = useLocalSearchParams<{ check: string }>();
  const checkId = Number(check);
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [state, setState] = useState<HairState | null>(null);
  const [skipped, setSkipped] = useState<Zone[]>([]);
  const [phase, setPhase] = useState<Phase>("aim");
  const [count, setCount] = useState(0);
  const [shot, setShot] = useState<Shot | null>(null);
  const [ghostOn, setGhostOn] = useState(true);

  const reload = useCallback(async () => setState(await loadHairState(db)), [db]);
  useEffect(() => {
    reload();
  }, [reload]);

  const done = new Set(state?.photos.filter((p) => p.checkId === checkId).map((p) => p.zone));
  const zone = state ? (ZONES.find((z) => !done.has(z) && !skipped.includes(z)) ?? null) : null;
  const setup = zone ? ZONE_SETUP[zone] : null;
  const ghost = state && zone ? previousPhoto(state.photos, zone, checkId) : null;

  useEffect(() => {
    if (state && !zone) router.replace({ pathname: "/hair-check/finish", params: { check: String(checkId) } });
  }, [state, zone, checkId]);

  const capture = async () => {
    if (!camera.current || !zone || !state) return;
    setPhase("busy");
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.92, exif: true });
      const brightness = await analyzeShot(pic.uri, pic.exif);
      const result = compareBrightness(brightness, firstPhoto(state.photos, zone, checkId));
      if (result.ok) haptics.success();
      else haptics.warning();
      setShot({ uri: pic.uri, width: pic.width, height: pic.height, brightness, result });
      setPhase("review");
    } catch (e) {
      setPhase("aim");
      Alert.alert("Photo impossible", e instanceof Error ? e.message : String(e));
    }
  };

  // One buzz per second, so the countdown can be followed with the phone above the head.
  useEffect(() => {
    if (phase !== "countdown") return;
    if (count === 0) {
      capture();
      return;
    }
    const id = setTimeout(() => {
      haptics.impact();
      setCount((c) => c - 1);
    }, 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, count]);

  const shoot = () => {
    if (!setup) return;
    if (phase === "countdown") {
      setPhase("aim");
      return;
    }
    if (setup.countdown > 0) {
      haptics.impact();
      setCount(setup.countdown);
      setPhase("countdown");
    } else {
      capture();
    }
  };

  const keep = async () => {
    if (!shot || !zone) return;
    setPhase("busy");
    try {
      await savePhoto(db, checkId, zone, shot, shot.brightness);
      setShot(null);
      await reload();
    } finally {
      setPhase("aim");
    }
  };

  const retake = () => {
    if (shot) discardShot(shot.uri);
    setShot(null);
    setPhase("aim");
  };

  const close = () => {
    if (shot) discardShot(shot.uri);
    router.back();
  };

  if (!permission) return <View style={{ flex: 1, backgroundColor: t.media.bg }} />;

  if (!permission.granted) {
    return (
      <Screen back title="Caméra" subtitle="Nécessaire pour le check photo">
        <Notice tone="info">Les photos restent dans le dossier privé de l'app. Aucune n'est envoyée ni ajoutée à la galerie.</Notice>
        <Button
          label={permission.canAskAgain ? "Autoriser la caméra" : "Ouvrir les réglages Android"}
          icon="camera-outline"
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
        />
      </Screen>
    );
  }

  if (!zone || !setup) return <View style={{ flex: 1, backgroundColor: t.media.bg }} />;

  const position = ZONES.indexOf(zone) + 1;

  return (
    <View style={{ flex: 1, backgroundColor: t.media.bg }}>
      <StatusBar style="light" />
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing={setup.camera}
        mirror={setup.camera === "front"}
        flash="off"
        animateShutter
      />
      {ghost && ghostOn && phase !== "review" ? (
        <Image
          source={{ uri: ghost.uri }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          style={[StyleSheet.absoluteFill, { opacity: GHOST_OPACITY }]}
        />
      ) : null}
      <FrameGuide pose={setup.pose} />

      <View style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <IconButton icon="close" label="Fermer, le check reste à reprendre" onPress={close} />
          <View style={{ flexDirection: "row", gap: 6 }} accessibilityLabel={`Zone ${position} sur ${ZONES.length}`}>
            {ZONES.map((z) => (
              <View
                key={z}
                style={{
                  width: z === zone ? 22 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: done.has(z) ? t.media.ok : z === zone ? t.media.fg : t.media.muted,
                }}
              />
            ))}
          </View>
          <IconButton
            icon={ghostOn ? "layers" : "layers-outline"}
            label={ghostOn ? "Masquer la photo précédente" : "Afficher la photo précédente"}
            onPress={() => setGhostOn(!ghostOn)}
            disabled={!ghost}
          />
        </View>
        <View style={{ alignItems: "center" }}>
          <LevelIndicator pose={setup.pose} onLevelChange={(level) => level && haptics.tap()} />
        </View>
      </View>

      {phase === "countdown" ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", pointerEvents: "none" }]}>
          <Animated.View key={count} entering={popIn}>
            <Txt variant="display" color={t.media.fg} style={{ fontSize: 96, lineHeight: 104 }} accessibilityLiveRegion="assertive">
              {count}
            </Txt>
          </Animated.View>
        </View>
      ) : null}

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: space.lg,
          paddingBottom: insets.bottom + space.lg,
          paddingHorizontal: space.lg,
          gap: space.md,
          backgroundColor: t.media.scrim,
        }}
      >
        <View style={{ gap: 2 }}>
          <Txt variant="overline" color={t.media.muted}>
            Zone {position} / {ZONES.length}
          </Txt>
          <Txt variant="title" color={t.media.fg}>
            {ZONE_LABEL[zone]}
          </Txt>
          <Txt variant="callout" color={t.media.muted}>
            {setup.hint}
            {ghost ? " La photo précédente est en transparence." : ""}
          </Txt>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Passer la zone ${ZONE_LABEL[zone]}`}
              hitSlop={8}
              disabled={phase !== "aim"}
              onPress={() => setSkipped([...skipped, zone])}
              style={{ minHeight: 44, justifyContent: "center", opacity: phase === "aim" ? 1 : 0.4 }}
            >
              <Txt variant="bodyStrong" color={t.media.fg}>
                Passer
              </Txt>
            </Pressable>
          </View>
          <Shutter
            countdown={setup.countdown}
            running={phase === "countdown"}
            busy={phase === "busy"}
            onPress={shoot}
          />
          <View style={{ flex: 1 }} />
        </View>
      </View>

      {phase === "review" && shot ? (
        <Animated.View entering={reveal} style={[StyleSheet.absoluteFill, { backgroundColor: t.media.bg }]}>
          <Image source={{ uri: shot.uri }} resizeMode="contain" style={{ flex: 1, marginTop: insets.top }} accessibilityLabel={`Photo ${ZONE_LABEL[zone]}`} />
          <View
            style={{
              backgroundColor: t.surface,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              padding: space.lg,
              paddingBottom: insets.bottom + space.lg,
              gap: space.md,
            }}
          >
            <Txt variant="headline">{ZONE_LABEL[zone]}</Txt>
            <Notice tone={shot.result.ok ? "success" : "warning"}>{shot.result.message}</Notice>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Button label="Refaire" icon="refresh" variant={shot.result.ok ? "secondary" : "primary"} onPress={retake} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Garder" icon="checkmark" variant={shot.result.ok ? "primary" : "secondary"} onPress={keep} />
              </View>
            </View>
          </View>
        </Animated.View>
      ) : null}

      {phase === "busy" ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: t.media.scrim }]}>
          <ActivityIndicator color={t.media.fg} size="large" />
        </View>
      ) : null}
    </View>
  );
}

/** Dashed guide: a band for the hairline and temples, a circle for the crown. */
function FrameGuide({ pose }: { pose: "upright" | "flat" }) {
  const t = useTheme();
  const flat = pose === "flat";
  return (
    <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: flat ? "center" : "flex-start", paddingTop: flat ? 0 : "42%", pointerEvents: "none" }]}>
      <View
        style={{
          width: flat ? "72%" : "84%",
          aspectRatio: flat ? 1 : 1.7,
          borderRadius: flat ? radius.pill : radius.xl,
          borderWidth: 2,
          borderStyle: "dashed",
          borderColor: t.media.guide,
        }}
      />
    </View>
  );
}

/** Round shutter. With a countdown it starts the timer, and stops it while running. */
function Shutter({ countdown, running, busy, onPress }: { countdown: number; running: boolean; busy: boolean; onPress: () => void }) {
  const t = useTheme();
  const press = usePressScale(0.92);
  const label = running ? "Arrêter le compte à rebours" : countdown > 0 ? `Lancer le retardateur de ${countdown} secondes` : "Prendre la photo";
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={busy}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={onPress}
        style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: t.media.fg, alignItems: "center", justifyContent: "center" }}
      >
        <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: running ? t.danger : t.media.fg, alignItems: "center", justifyContent: "center" }}>
          {running ? <Icon name="stop" size={24} color={t.dangerSoft} /> : countdown > 0 ? <Icon name="timer-outline" size={26} color={t.media.bg} /> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}
