import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import { LinearGradient } from "expo-linear-gradient";
import { haptics } from "@/lib/haptics";
import { popIn, timing, usePressScale } from "./motion";
import { Icon, Txt, type IconName } from "./primitives";
import { glassShadow, radius, space, typography, useAccent, useTheme, withAlpha, type Domain } from "./theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ButtonVariant = "primary" | "soft" | "outline" | "ghost" | "danger" | "secondary";

/**
 * Pill button, 48 px. `primary` is the tinted "prominent" action: the
 * domain accent with a glass highlight. `secondary` is kept as an alias of
 * `outline`. `haptic` is off by default: the outcome of the action gives the
 * feedback, so a save does not buzz twice.
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
  domain,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  haptic?: boolean;
  domain?: Domain;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const a = useAccent(domain);
  const press = usePressScale();
  const v = variant === "secondary" ? "outline" : variant;
  const colors: Record<Exclude<ButtonVariant, "secondary">, { bg: string; fg: string; border?: string }> = {
    primary: { bg: a.accent, fg: a.onAccent },
    soft: { bg: a.surfaceAccent, fg: a.onAccentSoft },
    outline: { bg: "transparent", fg: t.text, border: t.borderStrong },
    ghost: { bg: "transparent", fg: a.accentText },
    danger: { bg: t.dangerSoft, fg: t.danger },
  };
  const c = colors[v];
  const height = size === "sm" ? 44 : 48;
  const prominent = v === "primary" && !disabled;
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
          minHeight: height,
          paddingHorizontal: v === "ghost" ? 14 : space.xl,
          borderRadius: radius.pill,
          backgroundColor: c.bg,
          borderWidth: c.border ? 1 : 0,
          borderColor: c.border,
          opacity: disabled ? 0.45 : 1,
        },
        prominent
          ? { boxShadow: `${t.glassShadow}, inset 1px 1px 0 rgba(255,255,255,0.45), inset -1px -1px 0 rgba(0,0,0,0.08)` }
          : null,
        style,
        press.style,
      ]}
    >
      {prominent ? (
        <LinearGradient
          colors={["rgba(255,255,255,0.3)", "rgba(255,255,255,0)"]}
          locations={[0, 0.45]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.pill, pointerEvents: "none" }}
        />
      ) : null}
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={20} color={c.fg} /> : null}
          <Txt variant="label" color={c.fg} numberOfLines={1}>
            {label}
          </Txt>
        </>
      )}
    </AnimatedPressable>
  );
}

/** Compact pill action inside a banner or the snackbar. */
export function PillButton({ label, onPress, color, background }: { label: string; onPress: () => void; color: string; background: string }) {
  const press = usePressScale();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={onPress}
      style={[{ minHeight: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: background, alignItems: "center", justifyContent: "center" }, press.style]}
    >
      <Txt variant="label" color={color}>
        {label}
      </Txt>
    </AnimatedPressable>
  );
}

/**
 * Round icon-only button; `label` is read by screen readers. `glass` floats
 * over content (header buttons); `outline` is the stepper's ± button.
 */
export function IconButton({
  icon,
  label,
  onPress,
  variant = "glass",
  size = 44,
  disabled,
  haptic = false,
  color,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  variant?: "glass" | "surface" | "soft" | "ghost" | "outline" | "lens";
  size?: number;
  disabled?: boolean;
  haptic?: boolean;
  color?: string;
}) {
  const t = useTheme();
  const a = useAccent();
  const press = usePressScale(0.92);
  const v = variant === "surface" ? "glass" : variant;
  const bg = v === "glass" ? t.glass : v === "soft" ? a.surfaceAccent : v === "lens" ? t.lens : "transparent";
  const fg = color ?? (v === "soft" ? a.onAccentSoft : t.text);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={size < 44 ? (44 - size) / 2 : 2}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        if (haptic) haptics.tap();
        onPress();
      }}
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bg,
          borderWidth: v === "outline" ? 1 : 0,
          borderColor: t.borderStrong,
          opacity: disabled ? 0.4 : 1,
        },
        v === "glass" ? glassShadow(t) : null,
        v === "lens" ? { boxShadow: t.lensRim } : null,
        press.style,
      ]}
    >
      {v === "glass" ? <GlassSpecular radius={size / 2} /> : null}
      <Icon name={icon} size={size >= 56 ? 24 : 22} color={fg} />
    </AnimatedPressable>
  );
}

/** Top-left highlight that makes a translucent fill read as glass. */
export function GlassSpecular({ radius: r }: { radius: number }) {
  const t = useTheme();
  return (
    <LinearGradient
      colors={[t.glassSpec, withAlpha(t.glassSpec, 0)]}
      locations={[0, 0.42]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: r, pointerEvents: "none" }}
    />
  );
}

export function Field({
  label,
  error,
  helper,
  onFocus,
  onBlur,
  mono,
  ...props
}: TextInputProps & { label: string; error?: string | null; helper?: string; mono?: boolean }) {
  const t = useTheme();
  const a = useAccent();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space.xs }}>
      <Txt variant="captionStrong" tone="muted">
        {label}
      </Txt>
      <TextInput
        placeholderTextColor={t.textSubtle}
        accessibilityLabel={label}
        cursorColor={a.accent}
        selectionColor={withAlpha(a.accent, 0.3)}
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
          mono ? { fontFamily: "monospace", fontSize: 13, lineHeight: 20 } : typography.body,
          {
            color: t.text,
            backgroundColor: t.surface,
            borderRadius: radius.md,
            borderWidth: focused || error ? 2 : 1,
            borderColor: error ? t.danger : focused ? a.accent : t.borderStrong,
            paddingHorizontal: focused || error ? 15 : 16,
            paddingVertical: props.multiline ? 12 : 0,
            minHeight: 48,
            textAlignVertical: props.multiline ? "top" : "center",
          },
          props.style,
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

/**
 * Segmented control: a glass lens slides under the chosen option.
 * `value` may match no option (nothing selected).
 */
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
      style={{ flexDirection: "row", backgroundColor: t.surfaceAlt, borderRadius: radius.pill, padding: 4 }}
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
              borderRadius: radius.pill,
              backgroundColor: t.dark ? t.lens : t.surface,
              boxShadow: t.lensRim,
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
        <Txt variant="label" numberOfLines={1} color={active ? t.text : t.textMuted}>
          {label}
        </Txt>
      </Animated.View>
    </Pressable>
  );
}

/** Outlined pill; selected = soft accent fill, accent edge and a check. */
export function Chip({ label, active, onPress, style }: { label: string; active: boolean; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const a = useAccent();
  const press = usePressScale(0.95);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={onPress}
      style={[
        {
          flexDirection: "row",
          gap: 4,
          height: 48,
          minWidth: 48,
          paddingHorizontal: 18,
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? a.surfaceAccent : t.surface,
          borderWidth: active ? 1.5 : 1,
          borderColor: active ? a.accent : t.border,
        },
        style,
        press.style,
      ]}
    >
      {active ? (
        <Animated.View entering={popIn}>
          <Icon name="checkmark" size={16} color={a.onAccentSoft} />
        </Animated.View>
      ) : null}
      <Txt variant="label" numberOfLines={1} color={active ? a.onAccentSoft : t.text}>
        {label}
      </Txt>
    </AnimatedPressable>
  );
}

function ChipRow({ scroll, fill, children }: { scroll?: boolean; fill?: boolean; children: ReactNode }) {
  if (scroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -space.lg, flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={{ flexDirection: "row", flexWrap: fill ? "nowrap" : "wrap", gap: space.sm }}>{children}</View>;
}

/**
 * One choice among a few. `scroll` keeps them on one line that scrolls
 * edge to edge (filters); `fill` shares the width equally (2 to 4 options).
 */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  scroll,
  fill,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  scroll?: boolean;
  fill?: boolean;
}) {
  return (
    <ChipRow scroll={scroll} fill={fill}>
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          active={o.value === value}
          style={fill ? { flex: 1, paddingHorizontal: space.sm } : undefined}
          onPress={() => {
            if (o.value === value) return;
            haptics.tap();
            onChange(o.value);
          }}
        />
      ))}
    </ChipRow>
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
    <ChipRow>
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
    </ChipRow>
  );
}

/** The 24 px rounded box itself, inside a 48 px touch target owned by the row. */
export function CheckMark({ state }: { state: "empty" | "done" | "skipped" }) {
  const t = useTheme();
  const a = useAccent();
  return (
    <View style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: radius.sm,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: state === "done" ? a.accent : state === "skipped" ? t.warningSoft : "transparent",
          borderWidth: state === "empty" ? 2 : 0,
          borderColor: t.borderStrong,
        }}
      >
        {state === "done" ? (
          <Animated.View entering={popIn}>
            <Icon name="checkmark" size={18} color={a.onAccent} />
          </Animated.View>
        ) : state === "skipped" ? (
          <Animated.View entering={popIn}>
            <Icon name="close" size={16} color={t.warning} />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * One-tap check for a dose. "done" pops a check mark, "skipped" a cross.
 * Pressing an empty box logs; a filled one is display-only. The check
 * shows on the press itself, with the haptic, and the parent's reload
 * confirms it a moment later; a failed `onPress` puts the box back.
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
  const press = usePressScale(0.9);
  const [optimistic, setOptimistic] = useState(false);
  useEffect(() => setOptimistic(false), [state]);
  const shown = optimistic ? "done" : state;
  return (
    <AnimatedPressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: shown === "done", disabled: shown !== "empty" }}
      disabled={shown !== "empty" || !onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        setOptimistic(true);
        haptics.success();
        Promise.resolve(onPress?.()).catch(() => setOptimistic(false));
      }}
      style={press.style}
    >
      <CheckMark state={shown} />
    </AnimatedPressable>
  );
}

/**
 * On / off. The thumb slides with a timing curve; a vibration confirms the
 * change. The track takes the accent of the surrounding domain.
 */
export function Switch({ value, onChange, label, domain }: { value: boolean; onChange: (v: boolean) => void; label: string; domain?: Domain }) {
  const t = useTheme();
  const a = useAccent(domain);
  const press = usePressScale(0.95);
  const x = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    x.value = withTiming(value ? 1 : 0, timing.slide);
  }, [value, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: 2 + x.value * 20 }] }));
  return (
    <AnimatedPressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      hitSlop={8}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        haptics.tap();
        onChange(!value);
      }}
      style={[
        {
          width: 64,
          height: 32,
          borderRadius: 16,
          justifyContent: "center",
          backgroundColor: value ? a.accent : t.track,
          boxShadow: value ? undefined : `inset 0 0 0 1.5px ${t.borderStrong}`,
        },
        press.style,
      ]}
    >
      <Animated.View style={[{ width: 40, height: 28, borderRadius: 14, backgroundColor: t.thumb, boxShadow: t.thumbShadow }, thumb]} />
    </AnimatedPressable>
  );
}

/**
 * Stepped slider: the thumb follows the finger 1:1, settles on the nearest
 * step and vibrates once per step crossed. Screen readers adjust it step by
 * step. `value` and `onChange` are step indexes.
 */
export function Slider({
  steps,
  value,
  onChange,
  label,
  valueText,
}: {
  steps: number;
  value: number;
  onChange: (index: number) => void;
  label: string;
  valueText: string;
}) {
  const t = useTheme();
  const a = useAccent();
  const THUMB = 40;
  const w = useSharedValue(0);
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const current = useSharedValue(value);
  const [width, setWidth] = useState(0);
  const max = Math.max(1, steps - 1);

  useEffect(() => {
    current.value = value;
    if (w.value > 0) x.value = withTiming((value / max) * w.value, timing.slide);
  }, [value, max, w, x, current]);

  const emit = (i: number) => {
    haptics.tap();
    onChange(i);
  };

  const pan = usePanGesture({
    minDistance: 0,
    onBegin: (e) => {
      "worklet";
      start.value = Math.min(w.value, Math.max(0, e.x - THUMB / 2));
      x.value = start.value;
    },
    onUpdate: (e) => {
      "worklet";
      x.value = Math.min(w.value, Math.max(0, start.value + e.translationX));
      const i = Math.round((x.value / Math.max(1, w.value)) * max);
      if (i !== current.value) {
        current.value = i;
        scheduleOnRN(emit, i);
      }
    },
    onFinalize: () => {
      "worklet";
      const i = Math.round((x.value / Math.max(1, w.value)) * max);
      x.value = withTiming((i / max) * w.value, timing.release);
      if (i !== current.value) {
        current.value = i;
        scheduleOnRN(emit, i);
      }
    },
  });

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const fill = useAnimatedStyle(() => ({ width: x.value }));

  return (
    <GestureDetector gesture={pan}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: valueText }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => {
          const next = value + (e.nativeEvent.actionName === "increment" ? 1 : -1);
          if (next >= 0 && next <= max) emit(next);
        }}
        onLayout={(e) => {
          const inner = e.nativeEvent.layout.width - THUMB;
          w.value = inner;
          x.value = (value / max) * inner;
          setWidth(inner);
        }}
        style={{ height: 40, justifyContent: "center" }}
      >
        <View style={{ position: "absolute", left: THUMB / 2, right: THUMB / 2, height: 6, borderRadius: 3, backgroundColor: t.track }} />
        <Animated.View style={[{ position: "absolute", left: THUMB / 2, height: 6, borderRadius: 3, backgroundColor: a.accent }, fill]} />
        {width > 0
          ? Array.from({ length: steps }, (_, i) => (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: THUMB / 2 + (i / max) * width - 1,
                  width: 2,
                  height: 6,
                  borderRadius: 1,
                  backgroundColor: t.borderStrong,
                  opacity: 0.5,
                }}
              />
            ))
          : null}
        <Animated.View style={[{ position: "absolute", left: 0, width: THUMB, height: 28, borderRadius: 14, backgroundColor: t.thumb, boxShadow: t.thumbShadow }, thumb]} />
      </View>
    </GestureDetector>
  );
}

/** Label, then − value + with 48 px round buttons. */
export function Stepper({
  label,
  value,
  onDecrement,
  onIncrement,
  canDecrement = true,
  canIncrement = true,
}: {
  label: string;
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
  canDecrement?: boolean;
  canIncrement?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 56 }}>
      <Txt style={{ flex: 1 }}>{label}</Txt>
      <IconButton
        icon="remove"
        variant="outline"
        size={48}
        haptic
        label={`Diminuer ${label.toLowerCase()}`}
        disabled={!canDecrement}
        onPress={onDecrement}
      />
      <Txt variant="bodyStrong" style={{ width: 64, textAlign: "center", fontVariant: ["tabular-nums"] }} accessibilityLiveRegion="polite">
        {value}
      </Txt>
      <IconButton
        icon="add"
        variant="outline"
        size={48}
        haptic
        label={`Augmenter ${label.toLowerCase()}`}
        disabled={!canIncrement}
        onPress={onIncrement}
      />
    </View>
  );
}

const NOTICE_ICON: Record<"info" | "success" | "warning" | "danger", IconName> = {
  info: "information-circle-outline",
  success: "checkmark-circle-outline",
  warning: "warning-outline",
  danger: "cloud-offline-outline",
};

/**
 * Banner inside a screen: a server that can't be reached, a renewal due, a
 * new plan. `action` adds the one button that resolves it (Réessayer, Voir).
 */
export function Notice({
  tone = "warning",
  title,
  icon,
  action,
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  icon?: IconName;
  action?: { label: string; onPress: () => void };
  children?: ReactNode;
}) {
  const t = useTheme();
  const a = useAccent();
  const c =
    tone === "danger"
      ? { bg: t.dangerSoft, fg: t.danger }
      : tone === "warning"
        ? { bg: t.warningSoft, fg: t.warning }
        : { bg: a.surfaceAccent, fg: a.onAccentSoft };
  return (
    <View
      accessibilityRole={tone === "warning" || tone === "danger" ? "alert" : undefined}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        backgroundColor: c.bg,
        borderRadius: radius.lg,
        paddingVertical: space.md,
        paddingLeft: space.lg,
        paddingRight: action ? space.sm : space.lg,
      }}
    >
      <Icon name={icon ?? NOTICE_ICON[tone]} size={20} color={c.fg} />
      <View style={{ flex: 1 }}>
        {title ? (
          <Txt variant="label" color={c.fg}>
            {title}
          </Txt>
        ) : null}
        {children ? (
          <Txt variant="callout" color={tone === "danger" ? t.text : c.fg}>
            {children}
          </Txt>
        ) : null}
      </View>
      {action ? <PillButton label={action.label} onPress={action.onPress} color={c.fg} background={withAlpha(c.fg, 0.12)} /> : null}
    </View>
  );
}

/** Nothing yet: round icon, one sentence on what to do, and the action that does it. */
export function EmptyState({
  icon,
  title,
  body,
  action,
  secondary,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.pill,
          backgroundColor: t.surfaceAlt,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: space.xs,
        }}
      >
        <Icon name={icon} size={28} color={t.textMuted} />
      </View>
      <Txt variant="headline" style={{ textAlign: "center" }}>
        {title}
      </Txt>
      {body ? (
        <Txt variant="callout" tone="muted" style={{ textAlign: "center" }}>
          {body}
        </Txt>
      ) : null}
      {action || secondary ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.sm, marginTop: space.sm }}>
          {action ? <Button label={action.label} variant="soft" onPress={action.onPress} /> : null}
          {secondary ? <Button label={secondary.label} variant="ghost" onPress={secondary.onPress} /> : null}
        </View>
      ) : null}
    </View>
  );
}
