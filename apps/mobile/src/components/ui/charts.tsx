import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { timing } from "./motion";
import { Txt } from "./primitives";
import { radius, useAccent, useTheme } from "./theme";

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
  const a = useAccent();
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
      style={{ height, borderRadius: radius.pill, backgroundColor: trackColor ?? t.track, overflow: "hidden" }}
    >
      <Animated.View
        style={[
          { height: "100%", width: "100%", borderRadius: radius.pill, backgroundColor: color ?? a.accent, transformOrigin: "left" },
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
      style={{ flexDirection: "row", height, borderRadius: radius.pill, overflow: "hidden", backgroundColor: t.track, gap: 2 }}
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
        style={[{ position: "absolute", left: 0, right: 0, bottom: 0, height, borderRadius: 6, backgroundColor: color, transformOrigin: "bottom" }, grow]}
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
  const a = useAccent();
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
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor ?? t.track} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? a.accent}
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

/**
 * Goal split in equal segments (glasses of water), filled up to `filled`.
 * Each segment grows from the left on its own, so a new glass reads as one step.
 */
export function SegmentGauge({ count, filled, label }: { count: number; filled: number; label: string }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: count, now: Math.min(count, filled) }}
      style={{ flexDirection: "row", gap: 4 }}
    >
      {Array.from({ length: count }, (_, i) => (
        <Segment key={i} on={i < filled} />
      ))}
    </View>
  );
}

function Segment({ on }: { on: boolean }) {
  const t = useTheme();
  const a = useAccent();
  const p = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    p.value = withTiming(on ? 1 : 0, timing.fill);
  }, [on, p]);
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }] }));
  return (
    <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: t.track, overflow: "hidden" }}>
      <Animated.View style={[{ height: "100%", width: "100%", borderRadius: 5, backgroundColor: a.accent, transformOrigin: "left" }, fill]} />
    </View>
  );
}

/**
 * Small bars, one per day (nights slept, sessions). `ratio` 0–1; `null`
 * draws an empty dashed slot (not logged yet); `faded` dims past days so
 * today stands out.
 */
export function DayBars({
  days,
  height = 32,
  label,
}: {
  days: { label: string; ratio: number | null; faded?: boolean; muted?: boolean }[];
  height?: number;
  label: string;
}) {
  const t = useTheme();
  const a = useAccent();
  return (
    <View accessibilityLabel={label} style={{ flexDirection: "row", gap: 6 }}>
      {days.map((d, i) => (
        <View key={i} style={{ flex: 1, alignItems: "center", gap: 4, minWidth: 0 }}>
          <View style={{ width: "100%", height, justifyContent: "flex-end" }}>
            {d.ratio === null ? (
              <View style={{ height, borderRadius: 6, borderWidth: 1.5, borderStyle: "dashed", borderColor: t.borderStrong }} />
            ) : (
              <DayBar ratio={d.ratio} height={height} color={d.muted ? t.surfaceAlt : a.accent} opacity={d.faded ? 0.45 : 1} />
            )}
          </View>
          <Txt variant="tab" tone="muted" numberOfLines={1}>
            {d.label}
          </Txt>
        </View>
      ))}
    </View>
  );
}

function DayBar({ ratio, height, color, opacity }: { ratio: number; height: number; color: string; opacity: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(clamp01(ratio), timing.fill);
  }, [ratio, p]);
  const grow = useAnimatedStyle(() => ({ transform: [{ scaleY: p.value }] }));
  return <Animated.View style={[{ height, borderRadius: 6, backgroundColor: color, opacity, transformOrigin: "bottom" }, grow]} />;
}
