import type { ReactNode } from "react";
import { Pressable, ScrollView, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { IconButton } from "./controls";
import { entering, layoutTransition, PRESSED_SCALE, timing } from "./motion";
import { IconTile, Txt, type IconName } from "./primitives";
import { elevation, radius, space, useTheme, type Tint } from "./theme";

/**
 * Every screen: safe-area aware scroll view with a large title header.
 * `back` shows a back button (screens pushed inside the Modules stack).
 */
export function Screen({
  title,
  subtitle,
  overline,
  back,
  right,
  children,
}: {
  title?: string;
  subtitle?: string;
  overline?: string;
  back?: boolean;
  right?: ReactNode;
  children?: ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + space.md,
        paddingHorizontal: space.lg,
        paddingBottom: space.xxxl,
        gap: space.lg,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {back || right ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          {back ? <IconButton icon="chevron-back" label="Retour" onPress={() => router.back()} /> : <View />}
          {right}
        </View>
      ) : null}
      {title ? (
        <Animated.View entering={FadeIn.duration(300)} style={{ gap: 2 }}>
          {overline ? (
            <Txt variant="overline" tone="muted">
              {overline}
            </Txt>
          ) : null}
          <Txt variant="display" accessibilityRole="header">
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
    </ScrollView>
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
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(e) => {
        scale.value = withTiming(PRESSED_SCALE, timing.press);
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withTiming(1, timing.release);
        props.onPressOut?.(e);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
