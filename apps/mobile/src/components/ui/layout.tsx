import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  View,
  type LayoutChangeEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { GestureDetector, GestureHandlerRootView, usePanGesture } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { BottomTabBarHeightContext } from "expo-router/tabs";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { GlassSpecular, IconButton } from "./controls";
import { EASE_IN, EASE_OUT, entering, layoutTransition, timing, usePressScale } from "./motion";
import { Icon, IconTile, Txt, type IconName } from "./primitives";
import { DomainScope, elevation, glassShadow, radius, space, useAccent, useDomain, useTheme, withAlpha, type Domain, type Tint } from "./theme";

/** Sticky row under the status bar: back button, compact title, actions. */
const NAV_HEIGHT = 52;
/** Scroll distance over which the bar and the compact title fade in. */
const FADE = 16;

/**
 * Shared with the floating tab bar: 1 while the user scrolls down a screen
 * (the bar shrinks to a round button), 0 when they scroll back up.
 */
type Chrome = { collapsed: SharedValue<number> };
const ChromeContext = createContext<Chrome | null>(null);

export function ChromeProvider({ children }: { children: ReactNode }) {
  const collapsed = useSharedValue(0);
  return <ChromeContext.Provider value={{ collapsed }}>{children}</ChromeContext.Provider>;
}

export function useChrome() {
  return useContext(ChromeContext);
}

/**
 * Soft wash of the domain colour behind the top of a screen (two radial
 * gradients, like light through tinted glass). It scrolls with the content.
 */
export function Wash({ domain, height = 440 }: { domain: Domain; height?: number }) {
  const t = useTheme();
  const d = t.domain[domain];
  const id = useId().replace(/:/g, "");
  return (
    <Svg width="100%" height={height} style={{ position: "absolute", top: 0, left: 0, right: 0, pointerEvents: "none" }}>
      <Defs>
        <RadialGradient id={`${id}a`} cx="0" cy="0" fx="0" fy="0" rx="1.3" ry="0.75">
          <Stop offset="0" stopColor={d.tint} stopOpacity={1} />
          <Stop offset="0.62" stopColor={d.tint} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}b`} cx="1" cy="0" fx="1" fy="0" rx="0.9" ry="0.6">
          <Stop offset="0" stopColor={d.tint2} stopOpacity={1} />
          <Stop offset="0.7" stopColor={d.tint2} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}b)`} />
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}a)`} />
    </Svg>
  );
}

export type Blob = { domain: Domain; cx: number; cy: number; rx: number; ry: number };

/** Several washes down a long page: one per dashboard tile, sitting behind it. */
export function BlobWash({ blobs, height }: { blobs: Blob[]; height: number }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const id = useId().replace(/:/g, "");
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ position: "absolute", top: 0, left: 0, right: 0, height, pointerEvents: "none" }}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            {blobs.map((b, i) => (
              <RadialGradient key={i} id={`${id}${i}`} cx="0.5" cy="0.5" r="0.5">
                <Stop offset="0" stopColor={t.domain[b.domain].tint} stopOpacity={1} />
                <Stop offset="1" stopColor={t.domain[b.domain].tint} stopOpacity={0} />
              </RadialGradient>
            ))}
          </Defs>
          {blobs.map((b, i) => (
            <Rect
              key={i}
              x={b.cx * width - b.rx * width}
              y={b.cy - b.ry}
              width={b.rx * width * 2}
              height={b.ry * 2}
              fill={`url(#${id}${i})`}
            />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

/**
 * Every screen: a large title that scrolls, under a sticky glass bar that
 * keeps the round back button and actions reachable. The bar fades in once
 * content slides under it, and the compact title takes over once the large
 * one is hidden. Content scrolls under the floating tab bar too; scrolling
 * down shrinks that bar to a round button. `domain` tints the header wash and
 * every accent inside; `backdrop` replaces the wash.
 */
export function Screen({
  title,
  subtitle,
  back,
  left,
  right,
  domain,
  backdrop,
  refreshing,
  onRefresh,
  children,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  left?: ReactNode;
  right?: ReactNode;
  domain?: Domain;
  backdrop?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  children?: ReactNode;
}) {
  const t = useTheme();
  const inherited = useDomain();
  const d = domain ?? inherited;
  const a = t.domain[d];
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const chrome = useChrome();
  const barHeight = insets.top + NAV_HEIGHT;

  const scrollY = useSharedValue(0);
  const lastY = useSharedValue(0);
  // Scroll offset at which the large title is under the bar; far away until laid out.
  const titleHidden = useSharedValue(1e6);
  const titleLayout = useRef({ blockY: -1, textBottom: -1 });
  const measure = (key: "blockY" | "textBottom", value: number) => {
    titleLayout.current[key] = value;
    const { blockY, textBottom } = titleLayout.current;
    if (blockY >= 0 && textBottom >= 0) titleHidden.value = blockY + textBottom - barHeight;
  };

  const collapsed = chrome?.collapsed;
  useEffect(() => {
    // A screen always opens with the full tab bar.
    if (collapsed) collapsed.value = withTiming(0, timing.slide);
  }, [collapsed]);

  const onScroll = useAnimatedScrollHandler((e) => {
    const y = e.contentOffset.y;
    const dy = y - lastY.value;
    lastY.value = y;
    scrollY.value = y;
    if (!collapsed) return;
    if (y > 56 && dy > 3 && collapsed.value === 0) collapsed.value = withTiming(1, timing.slide);
    else if ((dy < -3 || y < 24) && collapsed.value === 1) collapsed.value = withTiming(0, timing.slide);
  });
  const material = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, FADE], [0, 1], Extrapolation.CLAMP),
  }));
  const compact = useAnimatedStyle(() => {
    const start = Math.max(0, titleHidden.value - 12);
    const p = interpolate(scrollY.value, [start, start + FADE], [0, 1], Extrapolation.CLAMP);
    return { opacity: p, transform: [{ translateY: (1 - p) * 6 }] };
  });

  return (
    <DomainScope domain={d}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: barHeight + space.sm,
            paddingHorizontal: space.lg,
            paddingBottom: (tabBarHeight || insets.bottom) + space.xxl,
            gap: space.md,
          }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={!!refreshing}
                onRefresh={onRefresh}
                progressViewOffset={barHeight}
                colors={[a.accent]}
                progressBackgroundColor={t.surface}
              />
            ) : undefined
          }
        >
          <View style={{ position: "absolute", top: 0, left: 0, right: 0 }}>{backdrop ?? <Wash domain={d} />}</View>
          {title ? (
            <Animated.View
              entering={FadeIn.duration(300)}
              onLayout={(e) => measure("blockY", e.nativeEvent.layout.y)}
              style={{ gap: 2, paddingHorizontal: space.xs, paddingBottom: space.xs }}
            >
              <Txt
                variant="display"
                accessibilityRole="header"
                onLayout={(e) => measure("textBottom", e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
              >
                {title}
              </Txt>
              {subtitle ? (
                <Txt variant="callout" tone="muted">
                  {subtitle}
                </Txt>
              ) : null}
            </Animated.View>
          ) : null}
          {children}
        </Animated.ScrollView>

        <View style={{ position: "absolute", top: 0, left: 0, right: 0, pointerEvents: "box-none" }}>
          <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0, pointerEvents: "none" }, material]}>
            <LinearGradient
              colors={[t.bg, withAlpha(t.bg, 0.92), withAlpha(t.bg, 0)]}
              locations={[0, 0.6, 1]}
              style={{ height: barHeight + 24 }}
            />
          </Animated.View>
          <View
            style={{
              marginTop: insets.top,
              height: NAV_HEIGHT,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: space.sm,
              paddingHorizontal: space.md,
              pointerEvents: "box-none",
            }}
          >
            <Animated.View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[{ position: "absolute", left: 64, right: 64, alignItems: "center", pointerEvents: "none" }, compact]}
            >
              {title ? (
                <Txt variant="nav" numberOfLines={1}>
                  {title}
                </Txt>
              ) : null}
            </Animated.View>
            <View style={{ flexDirection: "row", gap: space.sm, pointerEvents: "box-none" }}>
              {back ? <IconButton icon="chevron-back" label="Retour" onPress={() => router.back()} /> : null}
              {left}
            </View>
            <View style={{ flexDirection: "row", gap: space.sm, pointerEvents: "box-none" }}>{right}</View>
          </View>
        </View>
      </View>
    </DomainScope>
  );
}

/** Plain card: content, lists and forms. The dashboard uses glass Tiles instead. */
export function Card({
  title,
  subtitle,
  icon,
  color,
  right,
  index = 0,
  children,
  style,
  onLayout,
}: {
  title?: string;
  subtitle?: string;
  icon?: IconName;
  color?: Tint;
  right?: ReactNode;
  index?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const t = useTheme();
  return (
    <Animated.View
      entering={entering(index)}
      layout={layoutTransition}
      onLayout={onLayout}
      style={[{ backgroundColor: t.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md }, elevation(t), style]}
    >
      {title || icon || right ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          {icon ? <IconTile icon={icon} color={color} size={32} /> : null}
          <View style={{ flex: 1 }}>
            {title ? (
              <Txt variant="headline" accessibilityRole="header">
                {title}
              </Txt>
            ) : null}
            {subtitle ? (
              <Txt variant="caption" tone="muted">
                {subtitle}
              </Txt>
            ) : null}
          </View>
          {typeof right === "string" ? (
            <Txt variant="caption" tone="muted">
              {right}
            </Txt>
          ) : (
            right
          )}
        </View>
      ) : null}
      {children}
    </Animated.View>
  );
}

/**
 * Dashboard tile: frosted glass tinted by its domain, with a lens icon,
 * a title and a short note on the right. Everything inside takes the
 * domain's accent.
 */
export function Tile({
  domain,
  icon,
  title,
  note,
  index = 0,
  children,
  style,
}: {
  domain: Domain;
  icon: IconName;
  title: string;
  note?: string;
  index?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <DomainScope domain={domain}>
      <Animated.View
        entering={entering(index)}
        layout={layoutTransition}
        accessibilityLabel={title}
        style={[
          { backgroundColor: t.domain[domain].tile, borderRadius: radius.tile, padding: space.lg, gap: space.sm, minWidth: 0 },
          glassShadow(t),
          style,
        ]}
      >
        <GlassSpecular radius={radius.tile} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 28 }}>
          <IconTile icon={icon} color={domain} />
          <Txt variant="label" numberOfLines={1} accessibilityRole="header" style={{ flex: 1 }}>
            {title}
          </Txt>
          {note ? (
            <Txt variant="caption" tone="muted" numberOfLines={1} style={{ fontVariant: ["tabular-nums"] }}>
              {note}
            </Txt>
          ) : null}
        </View>
        {children}
      </Animated.View>
    </DomainScope>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that shrinks slightly under the finger, for tiles and cards. */
export function PressableScale({
  style,
  children,
  ...props
}: Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const press = usePressScale();
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(e) => {
        press.onPressIn();
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        press.onPressOut();
        props.onPressOut?.(e);
      }}
      style={[style, press.style]}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * Row of a list card: icon, title, one line of detail and a chevron when it
 * opens something. It highlights on touch-down. `right` replaces the chevron
 * (a switch, an amount, a pill).
 */
export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  subtitleTone = "muted",
  right,
  onPress,
  chevron,
  accessibilityLabel,
  children,
}: {
  icon?: IconName;
  iconColor?: Domain;
  title: string;
  subtitle?: string;
  subtitleTone?: "muted" | "accent" | "warning" | "danger";
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  accessibilityLabel?: string;
  children?: ReactNode;
}) {
  const t = useTheme();
  const a = useAccent(iconColor);
  const content = (
    <>
      {icon ? <Icon name={icon} size={24} color={iconColor ? a.accentText : t.text} /> : null}
      <View style={{ flex: 1 }}>
        <Txt>{title}</Txt>
        {subtitle ? (
          <Txt variant="callout" tone={subtitleTone}>
            {subtitle}
          </Txt>
        ) : null}
        {children}
      </View>
      {typeof right === "string" ? (
        <Txt variant="bodyStrong" style={{ fontVariant: ["tabular-nums"] }}>
          {right}
        </Txt>
      ) : (
        right
      )}
      {(chevron ?? (!!onPress && !right)) ? <Icon name="chevron-forward" size={20} color={t.textMuted} /> : null}
    </>
  );
  const rowStyle: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 56,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    marginHorizontal: -space.sm,
    borderRadius: radius.md,
  };
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      onPress={onPress}
      style={({ pressed }) => [rowStyle, pressed ? { backgroundColor: t.surfaceAlt } : null]}
    >
      {content}
    </Pressable>
  );
}

/**
 * Bottom sheet over a scrim. It slides up from the bottom, follows the
 * finger when dragged down by its handle and closes past a third of its
 * height (or on a quick flick). The scrim and Android back close it too.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle = "Glisse vers le bas pour fermer",
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  const t = useTheme();
  const domain = useDomain();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const [height, setHeight] = useState(600);
  const y = useSharedValue(800);
  const velocity = useSharedValue(0);
  const scrim = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      y.value = 800;
      y.value = withTiming(0, { duration: 320, easing: EASE_OUT });
      scrim.value = withTiming(1, { duration: 240, easing: EASE_OUT });
    } else if (mounted) {
      y.value = withTiming(height + 40, { duration: 220, easing: EASE_IN }, (done) => {
        if (done) scheduleOnRN(setMounted, false);
      });
      scrim.value = withTiming(0, { duration: 220, easing: EASE_IN });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const drag = usePanGesture({
    activeOffsetY: [-8, 8],
    onUpdate: (e) => {
      "worklet";
      y.value = e.translationY > 0 ? e.translationY : e.translationY / 4;
      velocity.value = e.velocityY;
    },
    onFinalize: () => {
      "worklet";
      if (y.value > height / 3 || velocity.value > 900) scheduleOnRN(onClose);
      else y.value = withTiming(0, timing.release);
    },
  });

  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <DomainScope domain={domain}>
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: "flex-end" }}>
            <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.scrim }, scrimStyle]}>
              <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose} style={{ flex: 1 }} />
            </Animated.View>
            <Animated.View
              accessibilityViewIsModal
              onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
              style={[
                {
                  marginHorizontal: space.sm,
                  marginBottom: insets.bottom + space.sm,
                  borderRadius: radius.xl,
                  backgroundColor: t.dark ? t.glass : withAlpha(t.surface, 0.94),
                  paddingHorizontal: space.lg,
                  paddingBottom: space.xl,
                  gap: space.sm,
                },
                glassShadow(t),
                panel,
              ]}
            >
              <GlassSpecular radius={radius.xl} />
              <GestureDetector gesture={drag}>
                <View style={{ paddingTop: space.sm, paddingBottom: space.xs, gap: space.sm }}>
                  <View style={{ alignItems: "center", paddingVertical: 4 }}>
                    <View style={{ width: 36, height: 5, borderRadius: radius.pill, backgroundColor: t.borderStrong }} />
                  </View>
                  <View>
                    <Txt variant="headline" accessibilityRole="header">
                      {title}
                    </Txt>
                    {subtitle ? (
                      <Txt variant="caption" tone="muted">
                        {subtitle}
                      </Txt>
                    ) : null}
                  </View>
                </View>
              </GestureDetector>
              {children}
            </Animated.View>
          </KeyboardAvoidingView>
        </DomainScope>
      </GestureHandlerRootView>
    </Modal>
  );
}
