import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View, type TextInputProps } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { haptics } from "@/lib/haptics";
import { popIn, timing, usePressScale } from "./motion";
import { Icon, Txt, type IconName } from "./primitives";
import { radius, space, typography, useTheme } from "./theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "danger";

/**
 * `haptic` is off by default: the outcome of the action (success, warning)
 * gives the feedback, so a save does not buzz twice.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  loading,
  disabled,
  haptic = false,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  haptic?: boolean;
}) {
  const t = useTheme();
  const press = usePressScale();
  const colors: Record<ButtonVariant, { bg: string; fg: string }> = {
    primary: { bg: t.primary, fg: t.onPrimary },
    secondary: { bg: t.surfaceAlt, fg: t.text },
    soft: { bg: t.primarySoft, fg: t.primaryText },
    ghost: { bg: "transparent", fg: t.primaryText },
    danger: { bg: t.dangerSoft, fg: t.danger },
  };
  const c = colors[variant];
  const sm = size === "sm";
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        if (haptic) haptics.tap();
        onPress();
      }}
      style={[
        {
          flexDirection: "row",
          gap: space.sm,
          alignItems: "center",
          justifyContent: "center",
          minHeight: sm ? 44 : 52,
          paddingHorizontal: sm ? space.md : space.xl,
          borderRadius: sm ? radius.sm + 2 : radius.md,
          backgroundColor: c.bg,
          opacity: disabled ? 0.45 : 1,
        },
        press.style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={sm ? 18 : 20} color={c.fg} /> : null}
          <Txt variant={sm ? "callout" : "bodyStrong"} color={c.fg} style={sm ? { fontFamily: typography.bodyStrong.fontFamily } : undefined}>
            {label}
          </Txt>
        </>
      )}
    </AnimatedPressable>
  );
}

/** 44 × 44 icon-only button; `label` is read by screen readers. */
export function IconButton({
  icon,
  label,
  onPress,
  variant = "surface",
  disabled,
  haptic = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  variant?: "surface" | "soft" | "ghost";
  disabled?: boolean;
  haptic?: boolean;
}) {
  const t = useTheme();
  const press = usePressScale(0.95);
  const bg = variant === "surface" ? t.surface : variant === "soft" ? t.primarySoft : "transparent";
  const fg = variant === "soft" ? t.primaryText : t.text;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={4}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        if (haptic) haptics.tap();
        onPress();
      }}
      style={[
        {
          width: 44,
          height: 44,
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bg,
          borderWidth: variant === "surface" ? 1 : 0,
          borderColor: t.border,
          opacity: disabled ? 0.45 : 1,
        },
        press.style,
      ]}
    >
      <Icon name={icon} size={22} color={fg} />
    </AnimatedPressable>
  );
}

export function Field({
  label,
  error,
  helper,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & { label: string; error?: string | null; helper?: string }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="caption" tone="muted">
        {label}
      </Txt>
      <TextInput
        placeholderTextColor={t.textMuted}
        accessibilityLabel={label}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          typography.body,
          {
            color: t.text,
            backgroundColor: t.surfaceAlt,
            borderRadius: radius.md,
            borderWidth: 1.5,
            borderColor: error ? t.danger : focused ? t.primary : "transparent",
            paddingHorizontal: 14,
            paddingVertical: 12,
            minHeight: 52,
          },
        ]}
      />
      {error ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Icon name="alert-circle" size={14} color={t.danger} />
          <Txt variant="caption" tone="danger">
            {error}
          </Txt>
        </View>
      ) : helper ? (
        <Txt variant="caption" tone="muted">
          {helper}
        </Txt>
      ) : null}
    </View>
  );
}

/** Segmented control with a sliding thumb. `value` may match no option (nothing selected). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const placed = useRef(false);
  const index = options.findIndex((o) => o.value === value);
  const segment = width > 0 ? (width - 8) / options.length : 0;

  useEffect(() => {
    if (!segment || index < 0) return;
    if (placed.current) x.value = withTiming(index * segment, timing.slide);
    else x.value = index * segment;
    placed.current = true;
  }, [index, segment, x]);

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      accessibilityRole="radiogroup"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: "row", backgroundColor: t.surfaceAlt, borderRadius: radius.md, padding: 4 }}
    >
      {segment > 0 && index >= 0 ? (
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 4,
              bottom: 4,
              left: 4,
              width: segment,
              borderRadius: radius.sm,
              backgroundColor: t.primary,
            },
            thumb,
          ]}
        />
      ) : null}
      {options.map((o) => (
        <SegmentOption
          key={o.value}
          label={o.label}
          active={o.value === value}
          onPress={() => {
            if (o.value === value) return;
            haptics.tap();
            onChange(o.value);
          }}
        />
      ))}
    </View>
  );
}

function SegmentOption({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  const press = usePressScale(0.94);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={onPress}
      style={{ flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}
    >
      <Animated.View style={press.style}>
        <Txt variant="callout" numberOfLines={1} color={active ? t.onPrimary : t.text} style={{ fontFamily: typography.bodyStrong.fontFamily }}>
          {label}
        </Txt>
      </Animated.View>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  const press = usePressScale(0.97);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={onPress}
      style={[
        {
          minHeight: 44,
          minWidth: 44,
          paddingHorizontal: 14,
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? t.primary : t.surfaceAlt,
        },
        press.style,
      ]}
    >
      <Txt variant="callout" color={active ? t.onPrimary : t.text} style={{ fontFamily: typography.bodyStrong.fontFamily }}>
        {label}
      </Txt>
    </AnimatedPressable>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          active={o.value === value}
          onPress={() => {
            if (o.value === value) return;
            haptics.tap();
            onChange(o.value);
          }}
        />
      ))}
    </View>
  );
}

export function MultiChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {options.map((o) => {
        const active = value.includes(o.value);
        return (
          <Chip
            key={o.value}
            label={o.label}
            active={active}
            onPress={() => {
              haptics.tap();
              onChange(active ? value.filter((v) => v !== o.value) : [...value, o.value]);
            }}
          />
        );
      })}
    </View>
  );
}

/**
 * Round one-tap check. "done" pops a check mark, "skipped" a cross.
 * Pressing an empty circle logs; a filled one is display-only. The check
 * shows on the press itself, with the haptic, and the parent's reload
 * confirms it a moment later; a failed `onPress` puts the circle back.
 */
export function CheckCircle({
  state,
  label,
  onPress,
}: {
  state: "empty" | "done" | "skipped";
  label: string;
  onPress?: () => void | Promise<unknown>;
}) {
  const t = useTheme();
  const press = usePressScale(0.9);
  const [optimistic, setOptimistic] = useState(false);
  useEffect(() => setOptimistic(false), [state]);
  const shown = optimistic ? "done" : state;
  const bg = shown === "done" ? t.success : shown === "skipped" ? t.warningSoft : "transparent";
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ checked: shown === "done", disabled: shown !== "empty" }}
      disabled={shown !== "empty" || !onPress}
      hitSlop={4}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        setOptimistic(true);
        haptics.success();
        Promise.resolve(onPress?.()).catch(() => setOptimistic(false));
      }}
      style={[
        {
          width: 44,
          height: 44,
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bg,
          borderWidth: shown === "empty" ? 2 : 0,
          borderColor: t.textMuted,
        },
        press.style,
      ]}
    >
      {shown === "done" ? (
        <Animated.View entering={popIn}>
          <Icon name="checkmark" size={24} color={t.onSuccess} />
        </Animated.View>
      ) : shown === "skipped" ? (
        <Animated.View entering={popIn}>
          <Icon name="close" size={22} color={t.warning} />
        </Animated.View>
      ) : null}
    </AnimatedPressable>
  );
}
