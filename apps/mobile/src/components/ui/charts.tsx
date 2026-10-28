import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { timing } from "./motion";
import { radius, useTheme } from "./theme";

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Horizontal gauge. Animates scaleX (not width) so it stays on the UI thread. */
export function ProgressBar({
  value,
  color,
  trackColor,
  height = 8,
  label,
}: {
  value: number;
  color?: string;
  trackColor?: string;
  height?: number;
  label?: string;
}) {
  const t = useTheme();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(clamp01(value), timing.fill);
  }, [value, progress]);
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp01(value) * 100) }}
      style={{ height, borderRadius: radius.pill, backgroundColor: trackColor ?? t.surfaceAlt, overflow: "hidden" }}
    >
      <Animated.View
        style={[
          { height: "100%", width: "100%", borderRadius: radius.pill, backgroundColor: color ?? t.primary, transformOrigin: "left" },
          fill,
        ]}
      />
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Circular gauge with content in the middle. */
export function Ring({
  value,
  size = 72,
  stroke = 8,
  color,
  trackColor,
  label,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  children?: ReactNode;
}) {
  const t = useTheme();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(clamp01(value), timing.fill);
  }, [value, progress]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - progress.value) }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp01(value) * 100) }}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor ?? t.surfaceAlt} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? t.primary}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
        />
      </Svg>
      {children}
    </View>
  );
}
