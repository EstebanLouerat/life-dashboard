import { useContext, useRef, type ReactNode } from "react";
import { Pressable, RefreshControl, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { BottomTabBarHeightContext } from "expo-router/tabs";
import { IconButton } from "./controls";
import { entering, layoutTransition, usePressScale } from "./motion";
import { IconTile, Txt, type IconName } from "./primitives";
import { elevation, radius, space, useTheme, withAlpha, type Tint } from "./theme";

/** Sticky row under the status bar: back button, compact title, `right`. */
const NAV_HEIGHT = 52;
/** Fade between the bar and the content scrolling under it, instead of a hard divider. */
const EDGE = 16;
/** Scroll distance over which the bar and the compact title fade in. */
const FADE = 16;

/**
 * Every screen: a large title that scrolls, under a sticky bar that keeps
 * the back button reachable. The bar stays clear at rest; it gains the
 * background colour once content slides under it, and the compact title
 * takes over once the large one is hidden. Content scrolls under the
 * floating tab bar too, so the bottom padding clears it. `onRefresh` adds
 * pull-to-refresh.
 */
export function Screen({
  title,
  subtitle,
  overline,
  back,
  right,
  refreshing,
  onRefresh,
  children,
}: {
  title?: string;
  subtitle?: string;
  overline?: string;
  back?: boolean;
  right?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  children?: ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const hasNav = !!(back || right);
  const barHeight = insets.top + NAV_HEIGHT;

  const scrollY = useSharedValue(0);
  // Scroll offset at which the large title is under the bar; far away until laid out.
  const titleHidden = useSharedValue(1e6);
  const titleLayout = useRef({ blockY: -1, textBottom: -1 });
  const measure = (key: "blockY" | "textBottom", value: number) => {
    titleLayout.current[key] = value;
    const { blockY, textBottom } = titleLayout.current;
    if (blockY >= 0 && textBottom >= 0) titleHidden.value = blockY + textBottom - barHeight;
  };

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const material = useAnimatedStyle(() => {
    const start = hasNav ? 0 : Math.max(0, titleHidden.value - 12);
    return { opacity: interpolate(scrollY.value, [start, start + FADE], [0, 1], Extrapolation.CLAMP) };
  });
  const compact = useAnimatedStyle(() => {
    const start = Math.max(0, titleHidden.value - 12);
    const p = interpolate(scrollY.value, [start, start + FADE], [0, 1], Extrapolation.CLAMP);
    return { opacity: p, transform: [{ translateY: (1 - p) * 6 }] };
  });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: hasNav ? barHeight : insets.top + space.md,
          paddingHorizontal: space.lg,
          paddingBottom: tabBarHeight + space.xxl,
          gap: space.lg,
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              progressViewOffset={hasNav ? barHeight : insets.top}
              colors={[t.primary]}
              progressBackgroundColor={t.surface}
            />
          ) : undefined
        }
      >
        {title ? (
          <Animated.View entering={FadeIn.duration(300)} onLayout={(e) => measure("blockY", e.nativeEvent.layout.y)} style={{ gap: 2 }}>
            {overline ? (
              <Txt variant="overline" tone="muted">
                {overline}
              </Txt>
            ) : null}
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
          <View style={{ height: barHeight, backgroundColor: t.bg }} />
          <LinearGradient colors={[t.bg, withAlpha(t.bg, 0)]} style={{ height: EDGE }} />
        </Animated.View>
        <View
          style={{
            marginTop: insets.top,
            height: NAV_HEIGHT,
            flexDirection: "row",
            alignItems: "center",
            gap: space.md,
            paddingHorizontal: space.lg,
            pointerEvents: "box-none",
          }}
        >
          {back ? <IconButton icon="chevron-back" label="Retour" onPress={() => router.back()} /> : null}
          <Animated.View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[{ flex: 1, pointerEvents: "none" }, compact]}
          >
            {title ? (
              <Txt variant="headline" numberOfLines={1}>
                {title}
              </Txt>
            ) : null}
          </Animated.View>
          {right}
        </View>
      </View>
    </View>
  );
}

export function Card({
  title,
  subtitle,
  icon,
  color = "primary",
  right,
  index = 0,
  children,
  style,
}: {
  title?: string;
  subtitle?: string;
  icon?: IconName;
  color?: Tint;
  right?: ReactNode;
  index?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <Animated.View
      entering={entering(index)}
      layout={layoutTransition}
      style={[
        {
          backgroundColor: t.surface,
          borderRadius: radius.lg,
          padding: space.lg,
          gap: space.md,
          borderWidth: t.dark ? 1 : 0,
          borderColor: t.border,
        },
        elevation(t),
        style,
      ]}
    >
      {title || icon || right ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          {icon ? <IconTile icon={icon} color={color} /> : null}
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
          {right}
        </View>
      ) : null}
      {children}
    </Animated.View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that shrinks slightly under the finger, for tiles and rows. */
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
