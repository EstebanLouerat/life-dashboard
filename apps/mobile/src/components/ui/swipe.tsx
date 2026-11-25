import { useEffect, useRef, type ComponentRef, type ReactNode } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import { haptics } from "@/lib/haptics";
import { timing } from "./motion";
import { Icon, Txt, type IconName } from "./primitives";
import { radius, space, useAccent, useTheme } from "./theme";

export type SwipeAction = { icon: IconName; label: string; danger?: boolean; onAction: () => void };

/** Slide distance that arms the action; letting go past it runs the action. */
const ARM = 72;

/**
 * A row that slides sideways to act: swiped to the right it shows and runs
 * `left`, to the left `right`, then slides back. Vertical drags still scroll.
 * A swipe is not reachable with a screen reader: put the same actions in the
 * row's long-press menu (ListRow `onLongPress` + useActionSheet).
 */
export function Swipeable({
  left,
  right,
  children,
  background,
  rounded = radius.md,
  style,
}: {
  left?: SwipeAction;
  right?: SwipeAction;
  children: ReactNode;
  /** Behind the content at rest: the card's surface by default, `null` when the child is a card. */
  background?: string | null;
  /** Corner radius of what slides (a card: radius.lg). */
  rounded?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const x = useSharedValue(0);
  const armed = useSharedValue(0);
  const canRight = !!left;
  const canLeft = !!right;
  const active = useSharedValue(false);

  // Web: the click that ends a swipe would also press the row (Android cancels it natively).
  const box = useRef<ComponentRef<typeof View>>(null);
  const swipedAt = useRef(0);
  const markSwipe = () => {
    swipedAt.current = Date.now();
  };
  useEffect(() => {
    if (Platform.OS !== "web") return;
    type Target = { addEventListener: (type: string, fn: (e: { stopPropagation(): void; preventDefault(): void }) => void, capture: boolean) => void; removeEventListener: Target["addEventListener"] };
    const el = box.current as unknown as Target | null;
    const block = (e: { stopPropagation(): void; preventDefault(): void }) => {
      if (Date.now() - swipedAt.current < 400) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    el?.addEventListener("click", block, true);
    return () => el?.removeEventListener("click", block, true);
  }, []);

  const run = (side: number) => {
    const action = side > 0 ? left : right;
    if (!action) return;
    haptics.impact();
    action.onAction();
  };

  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-10, 10],
    onActivate: () => {
      "worklet";
      active.value = true;
    },
    onUpdate: (e) => {
      "worklet";
      const dx = (e.translationX > 0 && !canRight) || (e.translationX < 0 && !canLeft) ? 0 : e.translationX;
      // Follows the finger, then resists past the arming point.
      const over = Math.abs(dx) - ARM * 1.4;
      x.value = over > 0 ? Math.sign(dx) * (ARM * 1.4 + over / 3) : dx;
      const next = Math.abs(x.value) >= ARM ? Math.sign(x.value) : 0;
      if (next !== armed.value) {
        armed.value = next;
        if (next) scheduleOnRN(haptics.tap);
      }
    },
    onFinalize: () => {
      "worklet";
      if (active.value) scheduleOnRN(markSwipe);
      active.value = false;
      const side = armed.value;
      armed.value = 0;
      x.value = withTiming(0, timing.slide);
      if (side) scheduleOnRN(run, side);
    },
  });

  const content = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const showLeft = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, 24], [0, 1], Extrapolation.CLAMP) }));
  const showRight = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-24, 0], [1, 0], Extrapolation.CLAMP) }));
  const iconLeft = useAnimatedStyle(() => ({ transform: [{ scale: withTiming(armed.value === 1 ? 1.2 : 1, timing.press) }] }));
  const iconRight = useAnimatedStyle(() => ({ transform: [{ scale: withTiming(armed.value === -1 ? 1.2 : 1, timing.press) }] }));

  return (
    <GestureDetector gesture={pan}>
      <View ref={box} style={[{ borderRadius: rounded }, style]}>
        {left ? <Behind action={left} side="left" rounded={rounded} style={showLeft} icon={iconLeft} /> : null}
        {right ? <Behind action={right} side="right" rounded={rounded} style={showRight} icon={iconRight} /> : null}
        <Animated.View style={[{ borderRadius: rounded, backgroundColor: background === null ? undefined : (background ?? t.surface) }, content]}>
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

function Behind({
  action,
  side,
  rounded,
  style,
  icon,
}: {
  action: SwipeAction;
  side: "left" | "right";
  rounded: number;
  style: ReturnType<typeof useAnimatedStyle>;
  icon: ReturnType<typeof useAnimatedStyle>;
}) {
  const t = useTheme();
  const a = useAccent();
  const fg = action.danger ? t.danger : a.onAccentSoft;
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          borderRadius: rounded,
          backgroundColor: action.danger ? t.dangerSoft : a.surfaceAccent,
          flexDirection: side === "left" ? "row" : "row-reverse",
          alignItems: "center",
          gap: space.sm,
          paddingHorizontal: space.lg,
        },
        style,
      ]}
    >
      <Animated.View style={icon}>
        <Icon name={action.icon} size={22} color={fg} />
      </Animated.View>
      <Txt variant="label" color={fg}>
        {action.label}
      </Txt>
    </Animated.View>
  );
}
