import { useContext, useEffect, useRef, useState, type ComponentProps } from "react";
import { Keyboard, Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import type { Tabs } from "expo-router";
import { BottomTabBarHeightCallbackContext } from "expo-router/tabs";
import { elevation, Icon, radius, space, timing, Txt, usePressScale, useTheme, withAlpha, type IconName } from "@/components/ui";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

/** Outline icon when idle, filled when active. Routes not listed here get no tab. */
const ICONS: Record<string, [IconName, IconName]> = {
  index: ["sunny-outline", "sunny"],
  modules: ["grid-outline", "grid"],
  reglages: ["settings-outline", "settings"],
};

/** Fade above the pill: content dissolves into the background before passing under it. */
const EDGE = 24;

/**
 * Floating pill tab bar with a sliding active indicator. It floats over the
 * screens (they scroll under it and pad by its height, reported through
 * BottomTabBarHeightCallbackContext) and steps aside while the keyboard is up.
 */
export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: TabBarProps) {
  const t = useTheme();
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const keyboardShown = useKeyboardShown();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const placed = useRef(false);

  const routes = state.routes.filter((r) => r.name in ICONS);
  const active = routes.findIndex((r) => r.key === state.routes[state.index]?.key);
  const segment = width > 0 ? (width - 12) / routes.length : 0;

  useEffect(() => {
    if (!segment || active < 0) return;
    if (placed.current) x.value = withTiming(active * segment, timing.slide);
    else x.value = active * segment;
    placed.current = true;
  }, [active, segment, x]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  if (keyboardShown) return null;

  return (
    <View
      onLayout={(e) => reportHeight?.(e.nativeEvent.layout.height)}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: space.lg,
        paddingTop: EDGE,
        paddingBottom: Math.max(insets.bottom, space.md),
        pointerEvents: "box-none",
      }}
    >
      <LinearGradient
        colors={[withAlpha(t.bg, 0), t.bg]}
        locations={[0, 0.55]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" }}
      />
      <View
        accessibilityRole="tablist"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[
          {
            flexDirection: "row",
            backgroundColor: t.surface,
            borderRadius: radius.xl,
            padding: 6,
            borderWidth: t.dark ? 1 : 0,
            borderColor: t.border,
          },
          elevation(t, 2),
        ]}
      >
        {segment > 0 && active >= 0 ? (
          <Animated.View
            style={[
              { position: "absolute", top: 6, bottom: 6, left: 6, width: segment, borderRadius: radius.lg, backgroundColor: t.primarySoft },
              indicator,
            ]}
          />
        ) : null}
        {routes.map((route, i) => {
          const focused = i === active;
          const [idle, filled] = ICONS[route.name];
          return (
            <TabButton
              key={route.key}
              label={descriptors[route.key]?.options.title ?? route.name}
              icon={focused ? filled : idle}
              focused={focused}
              onPress={() => {
                const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigateToTab(route.key);
              }}
              onLongPress={() => emitter.emit({ type: "tabLongPress", target: route.key })}
            />
          );
        })}
      </View>
    </View>
  );
}

function TabButton({
  label,
  icon,
  focused,
  onPress,
  onLongPress,
}: {
  label: string;
  icon: IconName;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const t = useTheme();
  const press = usePressScale(0.92);
  const color = focused ? t.primaryText : t.textMuted;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center" }}
    >
      <Animated.View style={[{ alignItems: "center", gap: 2 }, press.style]}>
        <Icon name={icon} size={22} color={color} />
        <Txt variant="caption" color={color} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {label}
        </Txt>
      </Animated.View>
    </Pressable>
  );
}

function useKeyboardShown() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setShown(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}
