import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { timing } from "./motion";
import { Txt } from "./primitives";
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

/** One bar split by share (e.g. monthly cost per category). Pair it with a legend. */
export function StackedBar({ segments, height = 12, label }: { segments: { value: number; color: string }[]; height?: number; label?: string }) {
  const t = useTheme();
  const visible = segments.filter((s) => s.value > 0);
  return (
    <View
      accessibilityLabel={label}
      style={{ flexDirection: "row", height, borderRadius: radius.pill, overflow: "hidden", backgroundColor: t.surfaceAlt, gap: 2 }}
    >
      {visible.map((s, i) => (
        <View key={i} style={{ flex: s.value, backgroundColor: s.color }} />
      ))}
    </View>
  );
}

/**
 * Small column chart (last months) with an optional goal line. Columns
 * reaching the goal use `reachedColor`. Negative values draw as empty.
 */
export function MiniBars({
  data,
  goal,
  color,
  reachedColor,
  height = 72,
}: {
  data: { label: string; value: number }[];
  goal?: number;
  color: string;
  reachedColor: string;
  height?: number;
}) {
  const t = useTheme();
  const max = Math.max(1, goal ?? 0, ...data.map((d) => d.value));
  return (
    <View style={{ gap: 6 }}>
      <View style={{ height, flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        {goal ? (
          <View
            style={{ position: "absolute", left: 0, right: 0, bottom: (goal / max) * height, borderTopWidth: 1, borderStyle: "dashed", borderColor: t.textMuted }}
          />
        ) : null}
        {data.map((d) => (
          <Bar key={d.label} ratio={Math.max(0, d.value) / max} color={goal && d.value >= goal ? reachedColor : color} height={height} />
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {data.map((d) => (
          <Txt key={d.label} variant="caption" tone="muted" style={{ flex: 1, textAlign: "center" }}>
            {d.label}
          </Txt>
        ))}
      </View>
    </View>
  );
}

function Bar({ ratio, color, height }: { ratio: number; color: string; height: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(clamp01(ratio), timing.fill);
  }, [ratio, progress]);
  const grow = useAnimatedStyle(() => ({ transform: [{ scaleY: progress.value }] }));
  return (
    <View style={{ flex: 1, height }}>
      <Animated.View
        style={[{ position: "absolute", left: 0, right: 0, bottom: 0, height, borderRadius: radius.sm - 4, backgroundColor: color, transformOrigin: "bottom" }, grow]}
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
