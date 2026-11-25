import type { ReactNode } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import { Icon, radius, space, timing, useTheme, type IconName } from "@/components/ui";
import { TILES, type LayoutEntry, type TileSize } from "@/lib/dashboard";
import { haptics } from "@/lib/haptics";

/** A tile's box in the page (scroll content coordinates), to find where a dragged tile lands. */
export type Frame = { x: number; y: number; w: number; h: number };

/** Hold before a drag starts in edit mode: a quick swipe still scrolls the page. */
const HOLD_MS = 180;

/**
 * Today's tile, editable in place. A long press anywhere on it (not on its
 * buttons) starts edit mode. In edit mode the tile's own buttons are
 * covered: hold then drag moves it onto another tile's place, the corner
 * buttons remove it or stretch / shrink it (tap, or drag the handle
 * sideways). Screen readers get Monter / Descendre / size / Retirer.
 */
export function EditableTile({
  entry,
  editing,
  first,
  last,
  frames,
  dragged,
  over,
  onEdit,
  onDrop,
  onRemove,
  onResize,
  onMoveBy,
  onLayout,
  children,
}: {
  entry: LayoutEntry;
  editing: boolean;
  first: boolean;
  last: boolean;
  frames: SharedValue<Record<string, Frame>>;
  dragged: SharedValue<string>;
  over: SharedValue<string>;
  onEdit: () => void;
  onDrop: (target: string) => void;
  onRemove: () => void;
  onResize: (size: TileSize) => void;
  onMoveBy: (step: -1 | 1) => void;
  onLayout: (e: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  const t = useTheme();
  const info = TILES[entry.id];
  const id = entry.id;
  const other: TileSize | null = info.sizes.find((s) => s !== entry.size) ?? null;
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);

  const move = usePanGesture({
    activateAfterLongPress: HOLD_MS,
    onActivate: () => {
      "worklet";
      dragged.value = id;
      scheduleOnRN(haptics.tap);
    },
    onUpdate: (e) => {
      "worklet";
      if (dragged.value !== id) return;
      dx.value = e.translationX;
      dy.value = e.translationY;
      const me = frames.value[id];
      if (!me) return;
      const cx = me.x + me.w / 2 + e.translationX;
      const cy = me.y + me.h / 2 + e.translationY;
      let hit = "";
      for (const key of Object.keys(frames.value)) {
        const f = frames.value[key];
        if (key !== id && cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h) hit = key;
      }
      if (hit !== over.value) {
        over.value = hit;
        if (hit) scheduleOnRN(haptics.tap);
      }
    },
    onFinalize: () => {
      "worklet";
      if (dragged.value !== id) return;
      const target = over.value;
      dragged.value = "";
      over.value = "";
      if (target) {
        // The page re-renders in the new order; this tile is drawn again in its new place.
        dx.value = 0;
        dy.value = 0;
        scheduleOnRN(onDrop, target);
      } else {
        dx.value = withTiming(0, timing.slide);
        dy.value = withTiming(0, timing.slide);
      }
    },
  });

  // Stretch handle: drag right to widen, left to narrow; a tap switches.
  const stretch = usePanGesture({
    activeOffsetX: [-8, 8],
    onDeactivate: (e) => {
      "worklet";
      if (e.translationX > 24 && entry.size === "half" && other) scheduleOnRN(onResize, other);
      else if (e.translationX < -24 && entry.size === "large" && other) scheduleOnRN(onResize, other);
    },
  });

  const lift = useAnimatedStyle(() => {
    const active = dragged.value === id;
    return {
      zIndex: active ? 10 : 1,
      opacity: withTiming(active ? 0.92 : 1, timing.press),
      transform: [{ translateX: dx.value }, { translateY: dy.value }, { scale: withTiming(active ? 1.03 : editing ? 0.97 : 1, timing.release) }],
    };
  });
  const target = useAnimatedStyle(() => ({ opacity: withTiming(over.value === id ? 1 : 0, timing.press) }));

  return (
    <Animated.View onLayout={onLayout} style={[{ flex: 1 }, lift]}>
      <Pressable accessible={false} disabled={editing} onLongPress={onEdit} delayLongPress={350} style={{ flex: 1 }}>
        {children}
      </Pressable>
      {editing ? (
        <>
          <GestureDetector gesture={move}>
            <View
              accessible
              accessibilityLabel={`${info.title}, ${entry.size === "large" ? "large" : "moitié"}`}
              accessibilityHint="Maintiens puis glisse pour déplacer"
              accessibilityActions={[
                ...(first ? [] : [{ name: "up", label: "Monter" }]),
                ...(last ? [] : [{ name: "down", label: "Descendre" }]),
                ...(other ? [{ name: "size", label: other === "large" ? "Agrandir" : "Réduire" }] : []),
                { name: "remove", label: "Retirer" },
              ]}
              onAccessibilityAction={(e) => {
                const name = e.nativeEvent.actionName;
                if (name === "up") onMoveBy(-1);
                else if (name === "down") onMoveBy(1);
                else if (name === "size" && other) onResize(other);
                else if (name === "remove") onRemove();
              }}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: radius.tile,
                borderWidth: 1.5,
                borderStyle: "dashed",
                borderColor: t.borderStrong,
              }}
            />
          </GestureDetector>
          <Animated.View
            style={[
              { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.tile, borderWidth: 2, borderColor: t.domain[info.domain].accent, pointerEvents: "none" },
              target,
            ]}
          />
          <Corner icon="remove" label={`Retirer ${info.title}`} danger onPress={onRemove} style={{ top: -6, left: -6 }} />
          {other ? (
            <GestureDetector gesture={stretch}>
              <View style={{ position: "absolute", bottom: -6, right: -6 }}>
                <Corner
                  icon={entry.size === "half" ? "expand-outline" : "contract-outline"}
                  label={other === "large" ? `Agrandir ${info.title}` : `Réduire ${info.title}`}
                  onPress={() => onResize(other)}
                />
              </View>
            </GestureDetector>
          ) : null}
        </>
      ) : null}
    </Animated.View>
  );
}

function Corner({
  icon,
  label,
  danger,
  onPress,
  style,
}: {
  icon: IconName;
  label: string;
  danger?: boolean;
  onPress: () => void;
  style?: { top?: number; left?: number };
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={[
        {
          position: style ? "absolute" : "relative",
          width: 30,
          height: 30,
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: danger ? t.dangerSoft : t.surface,
          borderWidth: 1,
          borderColor: t.border,
          boxShadow: t.thumbShadow,
          zIndex: 2,
        },
        style,
      ]}
    >
      <Icon name={icon} size={18} color={danger ? t.danger : t.text} />
    </Pressable>
  );
}

/** A row of tiles; the one holding the dragged tile is drawn above the others. */
export function TileRowView({
  ids,
  dragged,
  onLayout,
  children,
}: {
  ids: string[];
  dragged: SharedValue<string>;
  onLayout: (e: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  const lift = useAnimatedStyle(() => ({ zIndex: ids.includes(dragged.value) ? 10 : 0 }));
  return (
    <Animated.View onLayout={onLayout} style={[{ flexDirection: "row", gap: space.md, alignItems: "stretch" }, lift]}>
      {children}
    </Animated.View>
  );
}
