import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { DeviceMotion } from "expo-sensors";
import { useTheme } from "@/components/ui";

const SIZE = 76;
const BUBBLE = 18;
/** Tilt that pushes the bubble to the rim. */
const RANGE_DEG = 15;
/** Level within 4°, and only lost again past 6° so the state doesn't flicker at the edge. */
const ENTER_DEG = 4;
const EXIT_DEG = 6;

const sinDeg = (deg: number) => Math.sin((deg * Math.PI) / 180);
const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * Bubble level from the gravity vector. "upright": phone vertical facing the
 * user (front, temples). "flat": phone held flat above the head, screen up
 * (vertex, top). Reports level changes so the caller can buzz when the screen
 * is out of sight.
 */
export function LevelIndicator({ pose, onLevelChange }: { pose: "upright" | "flat"; onLevelChange?: (level: boolean) => void }) {
  const t = useTheme();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const [level, setLevel] = useState(false);
  const levelRef = useRef(false);
  const onChange = useRef(onLevelChange);
  onChange.current = onLevelChange;

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    DeviceMotion.isAvailableAsync().then((available) => {
      if (!available || cancelled) return;
      DeviceMotion.setUpdateInterval(50);
      sub = DeviceMotion.addListener(({ accelerationIncludingGravity: g }) => {
        if (!g) return;
        const norm = Math.hypot(g.x, g.y, g.z) || 1;
        // Left/right tilt is x in both poses; forward/back is y when flat, z when upright.
        const h = g.x / norm;
        const v = -(pose === "flat" ? g.y : g.z) / norm;
        const travel = (SIZE - BUBBLE) / 2;
        x.value = withTiming(clamp(h / sinDeg(RANGE_DEG)) * travel, { duration: 60 });
        y.value = withTiming(clamp(v / sinDeg(RANGE_DEG)) * travel, { duration: 60 });
        const tolerance = sinDeg(levelRef.current ? EXIT_DEG : ENTER_DEG);
        const isLevel = Math.abs(h) < tolerance && Math.abs(v) < tolerance;
        if (isLevel !== levelRef.current) {
          levelRef.current = isLevel;
          setLevel(isLevel);
          onChange.current?.(isLevel);
        }
      });
    });
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [pose, x, y]);

  const bubble = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }));
  const color = level ? t.success : t.media.fg;

  return (
    <View
      accessibilityLabel={level ? "Téléphone à niveau" : "Téléphone incliné"}
      accessibilityLiveRegion="polite"
      style={{
        width: SIZE,
        height: SIZE,
        borderRadius: SIZE / 2,
        borderWidth: 2,
        borderColor: color,
        backgroundColor: t.media.scrim,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View style={{ position: "absolute", width: SIZE - 4, height: 1, backgroundColor: t.media.muted }} />
      <View style={{ position: "absolute", width: 1, height: SIZE - 4, backgroundColor: t.media.muted }} />
      <View style={{ position: "absolute", width: BUBBLE + 10, height: BUBBLE + 10, borderRadius: (BUBBLE + 10) / 2, borderWidth: 1, borderColor: t.media.fg }} />
      <Animated.View style={[{ width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2, backgroundColor: color }, bubble]} />
    </View>
  );
}
