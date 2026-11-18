import { useEffect, type ComponentProps, type ReactNode } from "react";
import { Text, View, type StyleProp, type TextProps, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { radius, space, tint, typography, useAccent, useTheme, type Domain, type Tint, type TypographyVariant } from "./theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

type Tone = "default" | "muted" | "subtle" | "accent" | "warning" | "danger" | "inverse";

/** Text in one of the type styles. `accent` follows the surrounding domain. */
export function Txt({
  variant = "body",
  tone = "default",
  color,
  style,
  ...rest
}: TextProps & { variant?: TypographyVariant; tone?: Tone; color?: string }) {
  const t = useTheme();
  const a = useAccent();
  const toneColor = {
    default: t.text,
    muted: t.textMuted,
    subtle: t.textSubtle,
    accent: a.accentText,
    warning: t.warning,
    danger: t.danger,
    inverse: t.onInverse,
  }[tone];
  return <Text {...rest} style={[typography[variant], { color: color ?? toneColor }, style]} />;
}

export function Icon({ name, size = 24, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  return <Ionicons name={name} size={size} color={color ?? t.text} accessibilityElementsHidden importantForAccessibility="no" />;
}

/** Small round lens behind an icon (tile headers, rows). Decorative. */
export function IconTile({ icon, color, size = 28 }: { icon: IconName; color?: Tint; size?: number }) {
  const t = useTheme();
  const a = useAccent();
  const isStatus = color === "warning" || color === "danger";
  const bg = isStatus ? tint(t, color).soft : color ? t.domain[color as Domain].lensTint : a.lensTint;
  const fg = isStatus ? tint(t, color).solid : color ? t.domain[color as Domain].accentText : a.accentText;
  return (
    <View style={{ width: size, height: size, borderRadius: radius.pill, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={Math.round(size * 0.57)} color={fg} />
    </View>
  );
}

/**
 * Small pill. `soft` fills it with the colour's soft tone; `dashed` only
 * outlines it (an estimate); `neutral` is the grey status pill.
 */
export function Badge({
  label,
  color,
  icon,
  variant = "soft",
}: {
  label: string;
  color?: Tint | "neutral";
  icon?: IconName;
  variant?: "soft" | "dashed";
}) {
  const t = useTheme();
  const a = useAccent();
  const c =
    color === "neutral"
      ? { solid: t.textMuted, soft: t.surfaceAlt }
      : color
        ? tint(t, color)
        : { solid: a.onAccentSoft, soft: a.surfaceAccent };
  const dashed = variant === "dashed";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        alignSelf: "flex-start",
        minHeight: 24,
        backgroundColor: dashed ? "transparent" : c.soft,
        borderRadius: radius.pill,
        borderWidth: dashed ? 1 : 0,
        borderStyle: dashed ? "dashed" : "solid",
        borderColor: t.borderStrong,
        paddingHorizontal: 8,
      }}
    >
      {icon ? <Icon name={icon} size={14} color={dashed ? t.text : c.solid} /> : null}
      <Txt variant="caption" color={dashed ? t.text : color === "neutral" ? t.textMuted : c.solid} style={{ fontVariant: ["tabular-nums"] }}>
        {label}
      </Txt>
    </View>
  );
}

/** "Stocké sur ce téléphone": shown wherever health data is displayed. */
export function LocalBadge() {
  const t = useTheme();
  return (
    <View
      accessibilityLabel="Données stockées sur ce téléphone uniquement"
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 4,
        height: 24,
        paddingHorizontal: 8,
        borderRadius: radius.pill,
        backgroundColor: t.track,
      }}
    >
      <Icon name="phone-portrait-outline" size={12} color={t.textMuted} />
      <Txt variant="caption" tone="muted">
        Stocké sur ce téléphone
      </Txt>
    </View>
  );
}

/** Overline above a group of cards, with an optional count on the right. */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: space.sm, gap: space.sm }}>
      <Txt variant="overline" tone="muted" accessibilityRole="header" style={{ flex: 1 }}>
        {children}
      </Txt>
      {typeof right === "string" ? (
        <Txt variant="caption" tone="muted">
          {right}
        </Txt>
      ) : (
        right
      )}
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.border }} />;
}

export function Stat({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: Tint }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexBasis: "46%",
        flexGrow: 1,
        backgroundColor: t.surfaceAlt,
        borderRadius: radius.md + 4,
        padding: space.md,
        gap: 2,
      }}
    >
      <Txt variant="caption" tone="muted">
        {label}
      </Txt>
      <Txt variant="headline" color={color ? tint(t, color).solid : undefined} style={{ fontVariant: ["tabular-nums"] }}>
        {value}
      </Txt>
      {hint ? (
        <Txt variant="caption" tone="muted">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>{children}</View>;
}

/** Placeholder block while local data loads. Pulses unless motion is reduced. */
export function Skeleton({ height = 16, width = "100%", style }: { height?: number; width?: ViewStyle["width"]; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.55, { duration: 700 }), -1, true);
  }, [opacity]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ height, width, borderRadius: radius.md, backgroundColor: t.surfaceAlt }, pulse, style]} />;
}

/** A card-shaped skeleton: what a screen shows while its first query runs. */
export function SkeletonCard() {
  const t = useTheme();
  return (
    <View
      accessibilityLabel="Chargement"
      style={{ backgroundColor: t.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md }}
    >
      <Skeleton width="45%" />
      <Skeleton height={10} />
      <Skeleton height={10} width="75%" />
      <Skeleton height={28} />
    </View>
  );
}
