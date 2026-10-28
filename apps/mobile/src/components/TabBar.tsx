import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import type { Tabs } from "expo-router";
import { elevation, Icon, radius, space, timing, Txt, useTheme, type IconName } from "@/components/ui";
import { haptics } from "@/lib/haptics";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

/** Outline icon when idle, filled when active. Routes not listed here get no tab. */
const ICONS: Record<string, [IconName, IconName]> = {
  index: ["sunny-outline", "sunny"],
  modules: ["grid-outline", "grid"],
  reglages: ["settings-outline", "settings"],
};

/** Floating pill tab bar with a sliding active indicator. */
export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: TabBarProps) {
  const t = useTheme();
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

  return (
    <View style={{ backgroundColor: t.bg, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: Math.max(insets.bottom, space.md) }}>
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
          const label = descriptors[route.key]?.options.title ?? route.name;
          const [idle, filled] = ICONS[route.name];
          const color = focused ? t.primaryText : t.textMuted;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={() => {
                const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused) haptics.tap();
                if (!focused && !event.defaultPrevented) navigateToTab(route.key);
              }}
              onLongPress={() => emitter.emit({ type: "tabLongPress", target: route.key })}
              style={{ flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center", gap: 2 }}
            >
              <Icon name={focused ? filled : idle} size={22} color={color} />
              <Txt variant="caption" color={color}>
                {label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
