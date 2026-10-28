import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";

/**
 * Motion presets. Timing curves only (no springs), so nothing overshoots or
 * bounces. Reanimated skips these when the system "reduce motion" is on, and
 * every timing starts from the value on screen, so a new press or tap
 * redirects an animation mid-flight instead of waiting for it.
 */
export const EASE_OUT = Easing.out(Easing.cubic);
/** Mirror of EASE_OUT for exits: leaves the way it came in. */
export const EASE_IN = Easing.in(Easing.cubic);

export const timing = {
  press: { duration: 100, easing: EASE_OUT },
  release: { duration: 160, easing: EASE_OUT },
  slide: { duration: 240, easing: EASE_OUT },
  fill: { duration: 600, easing: EASE_OUT },
} as const;

/** Scale under the finger: barely visible, never bouncy. */
export const PRESSED_SCALE = 0.98;

/**
 * Shrinks on touch-down (not on release) and comes back on touch-up, so the
 * finger gets an answer before the action runs.
 */
export function usePressScale(to = PRESSED_SCALE) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    onPressIn: () => {
      scale.value = withTiming(to, timing.press);
    },
    onPressOut: () => {
      scale.value = withTiming(1, timing.release);
    },
  };
}

/**
 * Staggered card entrance: pass the card's position on screen. The stagger is
 * capped so the last card never waits more than 160 ms behind the first.
 */
export function entering(index: number) {
  return FadeInDown.delay(Math.min(index, 4) * 40)
    .duration(280)
    .easing(EASE_OUT)
    .withInitialValues({ transform: [{ translateY: 12 }] });
}

export const layoutTransition = LinearTransition.duration(240).easing(EASE_OUT);

/** Content revealed in place (an inline editor, a day panel). Exits faster than it enters. */
export const reveal = FadeIn.duration(200).easing(EASE_OUT);
export const conceal = FadeOut.duration(150).easing(EASE_IN);

/** Small icons that appear (check marks, droplets). */
export const popIn = ZoomIn.duration(180).easing(EASE_OUT);
