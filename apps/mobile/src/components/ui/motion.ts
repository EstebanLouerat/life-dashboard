import { Easing, FadeInDown, LinearTransition, ZoomIn } from "react-native-reanimated";

/**
 * Motion presets. Timing curves only (no springs), so nothing overshoots or
 * bounces. Reanimated skips these when the system "reduce motion" is on.
 */
export const EASE_OUT = Easing.out(Easing.cubic);

export const timing = {
  press: { duration: 110, easing: EASE_OUT },
  release: { duration: 160, easing: EASE_OUT },
  slide: { duration: 240, easing: EASE_OUT },
  fill: { duration: 600, easing: EASE_OUT },
} as const;

/** Scale under the finger: barely visible, never bouncy. */
export const PRESSED_SCALE = 0.98;

/** Staggered card entrance: pass the card's position on screen. */
export function entering(index: number) {
  return FadeInDown.delay(Math.min(index, 6) * 50)
    .duration(320)
    .easing(EASE_OUT)
    .withInitialValues({ transform: [{ translateY: 12 }] });
}

export const layoutTransition = LinearTransition.duration(240).easing(EASE_OUT);

/** Small icons that appear (check marks, droplets). */
export const popIn = ZoomIn.duration(180).easing(EASE_OUT);
