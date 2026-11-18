import { useContext, useEffect, useRef, useState, type ComponentProps } from "react";
import { Keyboard, Pressable, View } from "react-native";
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { Tabs } from "expo-router";
import { BottomTabBarHeightCallbackContext } from "expo-router/tabs";
import {
  DomainScope,
  GlassSpecular,
  glassShadow,
  Icon,
  radius,
  SnackbarHost,
  space,
  timing,
  Txt,
  useChrome,
  usePressScale,
  useTheme,
  type Domain,
  type IconName,
} from "@/components/ui";
import { SessionAccessory } from "@/components/SessionAccessory";
import { useWorkoutRunner } from "@/components/WorkoutRunner";

/** Height of the session accessory plus its gap, added to the reported bar height while a session runs. */
const ACCESSORY = 60;

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

/** Outline icon when idle, filled when active, and the domain each tab belongs to. Routes not listed get no tab. */
const TABS: Record<string, { icons: [IconName, IconName]; domain: Domain }> = {
  "(aujourdhui)": { icons: ["calendar-outline", "calendar"], domain: "encre" },
  courses: { icons: ["cart-outline", "cart"], domain: "courses" },
  sport: { icons: ["pulse-outline", "pulse"], domain: "sport" },
  sante: { icons: ["fitness-outline", "fitness"], domain: "sante" },
  plus: { icons: ["grid-outline", "grid"], domain: "encre" },
};

const BAR = 64;
const INSET = 4;

/**
 * Floating glass capsule, detached from the edges. A lens sits under the
 * active tab and slides to the next one. Scrolling down a screen shrinks the
 * bar to a round button with the current tab's icon (tap to bring it back);
 * the session accessory and the snackbar sit just above it. Screens scroll
 * under it and pad by its height (reported through
 * BottomTabBarHeightCallbackContext). It steps aside while the keyboard is up.
 */
export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: TabBarProps) {
  const t = useTheme();
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const chrome = useChrome();
  const { run } = useWorkoutRunner();
  const keyboardShown = useKeyboardShown();
  const [width, setWidth] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const x = useSharedValue(0);
  const placed = useRef(false);

  const routes = state.routes.filter((r) => r.name in TABS);
  const active = routes.findIndex((r) => r.key === state.routes[state.index]?.key);
  const activeTab = TABS[routes[active]?.name ?? "(aujourdhui)"];
  const segment = width > 0 ? (width - INSET * 2) / routes.length : 0;
  const bottom = Math.max(insets.bottom, space.md) + space.xs;
  const running = !!run;

  // Screens pad by this: the bar, its margin, and the accessory while a session runs.
  useEffect(() => {
    reportHeight?.(BAR + bottom + (running ? ACCESSORY : 0));
  }, [reportHeight, bottom, running]);

  useEffect(() => {
    if (!segment || active < 0) return;
    if (placed.current) x.value = withTiming(active * segment, timing.slide);
    else x.value = active * segment;
    placed.current = true;
  }, [active, segment, x]);

  const collapsedValue = chrome?.collapsed;
  useAnimatedReaction(
    () => (collapsedValue ? collapsedValue.value > 0.5 : false),
    (now, before) => {
      if (now !== before) scheduleOnRN(setCollapsed, now);
    },
  );

  const lens = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const bar = useAnimatedStyle(() => {
    const c = collapsedValue?.value ?? 0;
    return { opacity: 1 - c, transform: [{ scale: 1 - c * 0.1 }] };
  });
  const mini = useAnimatedStyle(() => {
    const c = collapsedValue?.value ?? 0;
    return { opacity: c, transform: [{ scale: 0.6 + c * 0.4 }] };
  });

  if (keyboardShown) return null;

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: space.md,
        paddingBottom: bottom,
        gap: space.sm,
        pointerEvents: "box-none",
      }}
    >
      <DomainScope domain={activeTab.domain}>
        <SnackbarHost />
        <SessionAccessory collapsed={collapsed} />
      </DomainScope>

      <View style={{ height: BAR, pointerEvents: "box-none" }}>
        <Animated.View
          accessibilityRole="tablist"
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={[
            {
              flexDirection: "row",
              height: BAR,
              borderRadius: BAR / 2,
              padding: INSET,
              backgroundColor: t.glass,
              pointerEvents: collapsed ? "none" : "auto",
            },
            glassShadow(t),
            bar,
          ]}
        >
          <GlassSpecular radius={BAR / 2} />
          {segment > 0 && active >= 0 ? (
            <Animated.View
              style={[
                {
                  position: "absolute",
                  top: INSET,
                  bottom: INSET,
                  left: INSET,
                  width: segment,
                  borderRadius: radius.pill,
                  backgroundColor: t.lens,
                  boxShadow: t.lensRim,
                },
                lens,
              ]}
            />
          ) : null}
          {routes.map((route, i) => {
            const focused = i === active;
            const tab = TABS[route.name];
            return (
              <TabButton
                key={route.key}
                label={descriptors[route.key]?.options.title ?? route.name}
                icon={focused ? tab.icons[1] : tab.icons[0]}
                domain={tab.domain}
                focused={focused}
                onPress={() => {
                  const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) navigateToTab(route.key);
                }}
                onLongPress={() => emitter.emit({ type: "tabLongPress", target: route.key })}
              />
            );
          })}
        </Animated.View>

        <Animated.View style={[{ position: "absolute", left: 0, top: (BAR - 56) / 2, pointerEvents: collapsed ? "auto" : "none" }, mini]}>
          <MiniButton
            icon={activeTab.icons[1]}
            domain={activeTab.domain}
            label={`Afficher les onglets (${descriptors[routes[active]?.key ?? ""]?.options.title ?? ""})`}
            onPress={() => {
              if (collapsedValue) collapsedValue.value = withTiming(0, timing.slide);
            }}
          />
        </Animated.View>
      </View>
    </View>
  );
}

function TabButton({
  label,
  icon,
  domain,
  focused,
  onPress,
  onLongPress,
}: {
  label: string;
  icon: IconName;
  domain: Domain;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const t = useTheme();
  const press = usePressScale(0.9);
  const color = focused ? t.domain[domain].accentText : t.text;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ flex: 1, height: BAR - INSET * 2, alignItems: "center", justifyContent: "center" }}
    >
      <Animated.View style={[{ alignItems: "center", gap: 2 }, press.style]}>
        <Icon name={icon} size={22} color={color} />
        <Txt variant="tab" color={color} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {label}
        </Txt>
      </Animated.View>
    </Pressable>
  );
}

function MiniButton({ icon, domain, label, onPress }: { icon: IconName; domain: Domain; label: string; onPress: () => void }) {
  const t = useTheme();
  const press = usePressScale(0.92);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPressIn={press.onPressIn} onPressOut={press.onPressOut} onPress={onPress}>
      <Animated.View
        style={[
          { width: 56, height: 56, borderRadius: 28, backgroundColor: t.glass, alignItems: "center", justifyContent: "center" },
          glassShadow(t),
          press.style,
        ]}
      >
        <GlassSpecular radius={28} />
        <Icon name={icon} size={24} color={t.domain[domain].accentText} />
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
