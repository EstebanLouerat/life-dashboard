import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Icon, radius, space, timing, Txt, useTheme } from "@/components/ui";

const KNOB = 44;
/** Step of the screen-reader increment / decrement actions. */
const A11Y_STEP = 0.1;

/** Past an edge the divider follows less and less (rubber band), then settles back on release. */
function rubberband(overshoot: number, dimension: number) {
  "worklet";
  const c = 0.55;
  return (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));
}

/**
 * Before / after on one frame: "before" on the left of the divider, "after"
 * on the right. The divider follows the finger 1:1 from where it was
 * grabbed (no jump to the touch point) and can be caught mid-settle. Only
 * transforms move, so it stays on the UI thread.
 */
export function CompareSlider({
  before,
  after,
  beforeLabel,
  afterLabel,
  aspect,
}: {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  /** width / height of the photos. */
  aspect: number;
}) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const w = useSharedValue(0);
  const x = useSharedValue(0);
  const start = useSharedValue(0);

  const pan = usePanGesture({
    activeOffsetX: [-6, 6],
    failOffsetY: [-12, 12],
    onBegin: () => {
      "worklet";
      start.value = x.value;
    },
    onUpdate: (e) => {
      "worklet";
      const next = start.value + e.translationX;
      x.value = next < 0 ? rubberband(next, w.value) : next > w.value ? w.value + rubberband(next - w.value, w.value) : next;
    },
    onFinalize: () => {
      "worklet";
      x.value = withTiming(Math.min(w.value, Math.max(0, x.value)), timing.release);
    },
  });

  // The "before" layer is a window whose right edge sits on the divider; its image is counter-shifted so it stays put.
  const windowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value - w.value }] }));
  const imageStyle = useAnimatedStyle(() => ({ transform: [{ translateX: w.value - x.value }] }));
  const handleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value - KNOB / 2 }] }));

  const nudge = (direction: 1 | -1) => {
    x.value = withTiming(Math.min(w.value, Math.max(0, x.value + direction * A11Y_STEP * w.value)), timing.slide);
  };

  return (
    <GestureDetector gesture={pan}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Comparaison, ${beforeLabel} à gauche, ${afterLabel} à droite`}
        accessibilityHint="Glisse horizontalement pour déplacer la séparation"
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === "increment" ? 1 : -1)}
        onLayout={(e) => {
          const next = e.nativeEvent.layout.width;
          setWidth(next);
          w.value = next;
          x.value = next / 2;
        }}
        style={{ width: "100%", aspectRatio: aspect, borderRadius: radius.lg, overflow: "hidden", backgroundColor: t.media.bg }}
      >
        <Image source={{ uri: after }} resizeMode="cover" style={StyleSheet.absoluteFill} />
        <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, left: 0, width, overflow: "hidden" }, windowStyle]}>
          <Animated.Image source={{ uri: before }} resizeMode="cover" style={[{ position: "absolute", top: 0, bottom: 0, left: 0, width }, imageStyle]} />
        </Animated.View>

        <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, left: 0, width: KNOB, alignItems: "center", justifyContent: "center", pointerEvents: "none" }, handleStyle]}>
          <View style={{ position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: t.media.fg }} />
          <View
            style={{
              width: KNOB,
              height: KNOB,
              borderRadius: KNOB / 2,
              backgroundColor: t.media.fg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="swap-horizontal" size={22} color={t.media.bg} />
          </View>
        </Animated.View>

        <Tag label={beforeLabel} side="left" />
        <Tag label={afterLabel} side="right" />
      </View>
    </GestureDetector>
  );
}

function Tag({ label, side }: { label: string; side: "left" | "right" }) {
  const t = useTheme();
  return (
    <View
      style={{
        position: "absolute",
        top: space.sm,
        [side]: space.sm,
        backgroundColor: t.media.scrim,
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
        pointerEvents: "none",
      }}
    >
      <Txt variant="caption" color={t.media.fg}>
        {label}
      </Txt>
    </View>
  );
}
