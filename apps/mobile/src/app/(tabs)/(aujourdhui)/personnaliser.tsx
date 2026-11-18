import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  Button,
  Card,
  Icon,
  IconButton,
  IconTile,
  Screen,
  SectionTitle,
  Segmented,
  Sheet,
  space,
  timing,
  Txt,
  useTheme,
  type IconName,
} from "@/components/ui";
import { availableTiles, moveTile, parseLayout, serializeLayout, TILES, type LayoutEntry, type TileId, type TileSize } from "@/lib/dashboard";
import { haptics } from "@/lib/haptics";
import { readSettings, writeSetting } from "@/lib/settings";

const ROW = 56;
const SIZE_LABEL: Record<TileSize, string> = { large: "Large", half: "Moitié" };

/**
 * Order, size and presence of Today's tiles. Every change is saved at once;
 * the check button only closes. Rows move by their handle (or with the
 * screen reader's "Monter" / "Descendre").
 */
export default function CustomizeScreen() {
  const db = useSQLiteContext();
  const [layout, setLayout] = useState<LayoutEntry[] | null>(null);
  const [editing, setEditing] = useState<{ id: TileId; size: TileSize; adding: boolean } | null>(null);

  useFocusEffect(
    useCallback(() => {
      readSettings(db).then((s) => setLayout(parseLayout(s.today_tiles)));
    }, [db]),
  );

  const save = (next: LayoutEntry[]) => {
    setLayout(next);
    writeSetting(db, "today_tiles", serializeLayout(next)).catch(console.warn);
  };

  if (!layout) return <Screen back title="Personnaliser" subtitle="Tableau Aujourd'hui" />;
  const available = availableTiles(layout);

  return (
    <Screen
      back
      title="Personnaliser"
      subtitle="Tableau Aujourd'hui"
      domain="encre"
      right={<IconButton icon="checkmark" label="Terminer" onPress={() => router.back()} />}
    >
      <Txt variant="callout" tone="muted" style={{ paddingHorizontal: space.xs }}>
        Glisse une tuile par sa poignée pour changer l'ordre. Touche une tuile pour choisir sa taille.
      </Txt>

      {layout.length ? (
        <Card style={{ paddingVertical: space.sm }}>
          <SortableList
            layout={layout}
            onMove={(from, to) => save(moveTile(layout, from, to))}
            onOpen={(entry) => setEditing({ id: entry.id, size: entry.size, adding: false })}
            onRemove={(id) => {
              haptics.impact();
              save(layout.filter((e) => e.id !== id));
            }}
          />
        </Card>
      ) : (
        <Txt tone="muted" style={{ paddingHorizontal: space.xs }}>
          Le tableau est vide : ajoute une tuile ci-dessous.
        </Txt>
      )}

      {available.length ? (
        <>
          <SectionTitle right={`${available.length} tuile${available.length > 1 ? "s" : ""}`}>Disponibles</SectionTitle>
          <Card style={{ gap: 0 }}>
            {available.map((id) => (
              <TileRow
                key={id}
                id={id}
                subtitle={TILES[id].describe[TILES[id].sizes[0]]}
                right={
                  <IconButton
                    icon="add"
                    variant="lens"
                    label={`Ajouter ${TILES[id].title}`}
                    onPress={() => setEditing({ id, size: TILES[id].sizes[0], adding: true })}
                  />
                }
              />
            ))}
          </Card>
        </>
      ) : null}

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? (editing.adding ? `Ajouter « ${TILES[editing.id].title} »` : TILES[editing.id].title) : ""}
        subtitle={editing?.adding ? undefined : "Taille de la tuile"}
      >
        {editing ? (
          <View style={{ gap: space.md }}>
            {TILES[editing.id].sizes.length > 1 ? (
              <Segmented
                options={TILES[editing.id].sizes.map((s) => ({ value: s, label: SIZE_LABEL[s] }))}
                value={editing.size}
                onChange={(size) => setEditing({ ...editing, size })}
              />
            ) : (
              <Txt variant="callout" tone="muted">
                Cette tuile n'existe qu'en taille {SIZE_LABEL[TILES[editing.id].sizes[0]].toLowerCase()}.
              </Txt>
            )}
            <Txt variant="caption" tone="muted">
              {SIZE_LABEL[editing.size]} · {TILES[editing.id].describe[editing.size]}.
              {editing.adding ? " Elle se place en bas du tableau ; tu pourras la déplacer ensuite." : ""}
            </Txt>
            <View style={{ flexDirection: "row", gap: space.md }}>
              <Button label="Annuler" variant="outline" style={{ flex: 1 }} onPress={() => setEditing(null)} />
              <Button
                label={editing.adding ? "Ajouter" : "Enregistrer"}
                style={{ flex: 1 }}
                onPress={() => {
                  haptics.success();
                  save(
                    editing.adding
                      ? [...layout, { id: editing.id, size: editing.size }]
                      : layout.map((e) => (e.id === editing.id ? { ...e, size: editing.size } : e)),
                  );
                  setEditing(null);
                }}
              />
            </View>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function SortableList({
  layout,
  onMove,
  onOpen,
  onRemove,
}: {
  layout: LayoutEntry[];
  onMove: (from: number, to: number) => void;
  onOpen: (entry: LayoutEntry) => void;
  onRemove: (id: TileId) => void;
}) {
  // Slot of each tile while dragging; the stored order follows on release.
  const positions = useSharedValue<Record<string, number>>({});
  useEffect(() => {
    positions.value = Object.fromEntries(layout.map((e, i) => [e.id, i]));
  }, [layout, positions]);

  return (
    <View style={{ height: layout.length * ROW }}>
      {layout.map((entry, i) => (
        <SortableRow
          key={entry.id}
          entry={entry}
          index={i}
          count={layout.length}
          positions={positions}
          onDrop={(to) => onMove(i, to)}
          onOpen={() => onOpen(entry)}
          onRemove={() => onRemove(entry.id)}
        />
      ))}
    </View>
  );
}

function SortableRow({
  entry,
  index,
  count,
  positions,
  onDrop,
  onOpen,
  onRemove,
}: {
  entry: LayoutEntry;
  index: number;
  count: number;
  positions: SharedValue<Record<string, number>>;
  onDrop: (to: number) => void;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const t = useTheme();
  const info = TILES[entry.id];
  const top = useSharedValue(index * ROW);
  const dragging = useSharedValue(false);
  const start = useSharedValue(0);

  useEffect(() => {
    top.value = index * ROW;
  }, [index, top]);

  const pan = usePanGesture({
    minDistance: 0,
    onBegin: () => {
      "worklet";
      dragging.value = true;
      start.value = top.value;
      scheduleOnRN(haptics.tap);
    },
    onUpdate: (e) => {
      "worklet";
      top.value = Math.min((count - 1) * ROW, Math.max(0, start.value + e.translationY));
      const slot = Math.round(top.value / ROW);
      const current = positions.value[entry.id];
      if (slot !== current) {
        const other = Object.keys(positions.value).find((k) => positions.value[k] === slot);
        const next = { ...positions.value, [entry.id]: slot };
        if (other) next[other] = current;
        positions.value = next;
        scheduleOnRN(haptics.tap);
      }
    },
    onFinalize: () => {
      "worklet";
      dragging.value = false;
      const slot = positions.value[entry.id] ?? index;
      top.value = withTiming(slot * ROW, timing.release);
      if (slot !== index) scheduleOnRN(onDrop, slot);
    },
  });

  const style = useAnimatedStyle(() => {
    const slot = positions.value[entry.id] ?? index;
    return {
      top: dragging.value ? top.value : withTiming(slot * ROW, timing.slide),
      zIndex: dragging.value ? 2 : 1,
      transform: [{ scale: withTiming(dragging.value ? 1.02 : 1, timing.press) }],
      backgroundColor: dragging.value ? t.surfaceAlt : "transparent",
    };
  });

  return (
    <Animated.View
      accessible
      accessibilityLabel={`${info.title}, ${SIZE_LABEL[entry.size]}`}
      accessibilityHint="Touche pour choisir la taille"
      accessibilityActions={[
        { name: "activate" },
        ...(index > 0 ? [{ name: "up", label: "Monter" }] : []),
        ...(index < count - 1 ? [{ name: "down", label: "Descendre" }] : []),
        { name: "remove", label: "Retirer" },
      ]}
      onAccessibilityAction={(e) => {
        const name = e.nativeEvent.actionName;
        if (name === "activate") onOpen();
        else if (name === "up") onDrop(index - 1);
        else if (name === "down") onDrop(index + 1);
        else if (name === "remove") onRemove();
      }}
      style={[{ position: "absolute", left: -space.sm, right: -space.sm, height: ROW, borderRadius: 12, flexDirection: "row", alignItems: "center" }, style]}
    >
      <GestureDetector gesture={pan}>
        <View style={{ width: 48, height: ROW, alignItems: "center", justifyContent: "center" }} accessibilityElementsHidden>
          <Icon name="reorder-three-outline" size={24} color={t.textMuted} />
        </View>
      </GestureDetector>
      <TileRow onPress={onOpen} id={entry.id} subtitle={`${SIZE_LABEL[entry.size]} · ${info.describe[entry.size]}`} />
      <IconButton icon="remove" variant="ghost" size={44} color={t.danger} label={`Retirer ${info.title}`} onPress={onRemove} />
    </Animated.View>
  );
}

/** Lens icon, title and size; touch opens the size sheet. */
function TileRow({ onPress, id, subtitle, right }: { onPress?: () => void; id: TileId; subtitle: string; right?: ReactNode }) {
  const t = useTheme();
  const info = TILES[id];
  const body = (
    <>
      <IconTile icon={info.icon as IconName} color={info.domain} size={32} />
      <View style={{ flex: 1 }}>
        <Txt numberOfLines={1}>{info.title}</Txt>
        <Txt variant="caption" tone="muted" numberOfLines={1}>
          {subtitle}
        </Txt>
      </View>
      {right}
    </>
  );
  const row = { flexDirection: "row" as const, alignItems: "center" as const, gap: space.md, minHeight: ROW, flex: 1, borderRadius: 12, paddingHorizontal: space.xs };
  if (!onPress) return <View style={row}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${info.title}, ${subtitle}`} onPress={onPress} style={({ pressed }) => [row, pressed ? { backgroundColor: t.surfaceAlt } : null]}>
      {body}
    </Pressable>
  );
}
