import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, BackHandler, Platform, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { GroceryPlan, GroceryRequest, WorkoutSession } from "@ld/contracts";
import { AddRow, BlobWash, Card, EmptyState, IconButton, Screen, SkeletonCard, space, Txt, useActionSheet, useSnackbar, type Blob, type IconName } from "@/components/ui";
import { EditableTile, TileRowView, type Frame } from "@/components/today/EditableTile";
import {
  DinnerTile,
  HairTile,
  HydrationTile,
  MoneyTile,
  SavingsTile,
  SleepTile,
  TreatmentsTile,
  WorkoutTile,
  type DoseTap,
  type TodayPlan,
} from "@/components/today/tiles";
import { useWorkoutRunner } from "@/components/WorkoutRunner";
import { dayProgress } from "@/lib/adherence";
import { availableTiles, moveTile, parseLayout, serializeLayout, TILES, tileRows, type LayoutEntry, type TileId, type TileSize } from "@/lib/dashboard";
import { addDays, today } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
import { refreshHairChecks, type HairState } from "@/lib/hairChecks";
import { loadNights, setNight } from "@/lib/nights";
import { nextHydrationReminder, parsePrefs } from "@/lib/reminders";
import { intSetting, readSettings, writeSetting } from "@/lib/settings";
import { SLEEP_BUCKETS, type Bucket, type Night } from "@/lib/sleep";
import type { DoseStatus } from "@/lib/stock";
import { refreshSubscriptions, subscriptionAlerts, type MoneyAlert } from "@/lib/subscriptions";
import { logDose, refreshTreatments, undoDose, type TreatmentState } from "@/lib/treatments";
import { refreshWishlist, wishlistAlerts, type WishlistState } from "@/lib/wishlist";

type TodayData = {
  day: string;
  ml: number;
  goal: number;
  glass: number;
  treatments: TreatmentState[];
  nights: Night[];
  tonight: Bucket | null;
  session: { id: number; data: WorkoutSession; rpe: string | null } | null;
  yesterdaySession: string | null;
  plan: TodayPlan | null;
  wishlist: WishlistState;
  hair: HairState;
  moneyAlerts: MoneyAlert[];
  /** "13:00", or null when hydration reminders are off. */
  nextReminder: string | null;
};

const fr = new Intl.NumberFormat("fr-FR");

/**
 * The day at a glance, in glass tiles tinted by domain: every daily log is
 * one tap (a glass of water, last night's range, a dose), confirmed by a
 * snackbar that can undo it. The layout is the user's (Personnaliser).
 */
export default function TodayScreen() {
  const db = useSQLiteContext();
  const snackbar = useSnackbar();
  const runner = useWorkoutRunner();
  const [data, setData] = useState<TodayData | null>(null);
  const [layout, setLayout] = useState<LayoutEntry[]>([]);
  const [rowsLayout, setRowsLayout] = useState<Record<number, { y: number; h: number }>>({});
  const [lastWaterAt, setLastWaterAt] = useState(0);
  const [editing, setEditing] = useState(false);
  const actions = useActionSheet();
  // Edit mode: where each tile sits, which one is dragged and which one it is over.
  const frames = useSharedValue<Record<string, Frame>>({});
  const dragged = useSharedValue("");
  const over = useSharedValue("");
  const boxes = useRef<{ rows: Record<string, number>; tiles: Record<string, { row: string; x: number; w: number; h: number }> }>({ rows: {}, tiles: {} });

  const load = useCallback(async () => {
    const day = today();
    const settings = await readSettings(db);
    setLayout(parseLayout(settings.today_tiles));
    const water = await db.getFirstAsync<{ total: number | null }>("SELECT SUM(ml) AS total FROM hydration_log WHERE day = ?", day);
    const nights = await loadNights(db);
    const sessionRow = await db.getFirstAsync<{ id: number; session_json: string; rpe: string | null }>(
      "SELECT id, session_json, rpe FROM workout_sessions WHERE day = ? ORDER BY id DESC LIMIT 1",
      day,
    );
    const yesterdayRow = await db.getFirstAsync<{ session_json: string }>(
      "SELECT session_json FROM workout_sessions WHERE day = ? ORDER BY id DESC LIMIT 1",
      addDays(day, -1),
    );
    const planRow = await db.getFirstAsync<{ id: number; plan_json: string; request_json: string; start_day: string | null; created_at: string }>(
      "SELECT id, plan_json, request_json, start_day, created_at FROM grocery_plans ORDER BY id DESC LIMIT 1",
    );
    const checked = planRow
      ? ((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM grocery_checks WHERE plan_id = ?", planRow.id))?.n ?? 0)
      : 0;
    const [treatments, hair, subs, wishlist] = await Promise.all([
      refreshTreatments(db),
      refreshHairChecks(db),
      refreshSubscriptions(db),
      refreshWishlist(db),
    ]);

    let plan: TodayPlan | null = null;
    if (planRow) {
      const parsed = GroceryPlan.safeParse(JSON.parse(planRow.plan_json));
      const request = GroceryRequest.safeParse(JSON.parse(planRow.request_json));
      if (parsed.success) {
        plan = {
          id: planRow.id,
          data: parsed.data,
          startDay: planRow.start_day ?? today(new Date(`${planRow.created_at.replace(" ", "T")}Z`)),
          store: request.success ? request.data.store : "lidl",
          budgetEur: request.success ? request.data.budgetEur : 60,
          checked,
        };
      }
    }
    const session = sessionRow ? WorkoutSession.safeParse(JSON.parse(sessionRow.session_json)) : null;
    const yesterday = yesterdayRow ? WorkoutSession.safeParse(JSON.parse(yesterdayRow.session_json)) : null;

    setData({
      day,
      ml: water?.total ?? 0,
      goal: intSetting(settings, "hydration_goal_ml", 2000),
      glass: intSetting(settings, "glass_ml", 250),
      treatments,
      nights,
      tonight: nights.find((n) => n.day === day)?.bucket ?? null,
      session: sessionRow && session?.success ? { id: sessionRow.id, data: session.data, rpe: sessionRow.rpe } : null,
      yesterdaySession: yesterday?.success ? yesterday.data.title : null,
      plan,
      wishlist,
      hair,
      moneyAlerts: [...subscriptionAlerts(subs), ...wishlistAlerts(wishlist)],
      nextReminder: nextHydrationReminder(parsePrefs(settings), new Date()),
    });
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Back in the app the next morning: show the new day.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });
    return () => sub.remove();
  }, [load]);

  /** Screen still showing an earlier day (open past midnight): refresh instead of logging on that day. */
  const stale = () => {
    if (!data || data.day === today()) return false;
    load();
    return true;
  };

  // ── one-tap logs: shown on the tap, written, then confirmed by the reload ──

  const addWater = async (glasses: number) => {
    if (!data || stale()) return;
    const ml = data.glass * glasses;
    const total = data.ml + ml;
    if (data.ml < data.goal && total >= data.goal) haptics.success();
    else haptics.impact();
    setData({ ...data, ml: total });
    setLastWaterAt(Date.now());
    let id = (await db.runAsync("INSERT INTO hydration_log (day, ml) VALUES (?, ?)", data.day, ml)).lastInsertRowId;
    load();
    snackbar.show({
      message: glasses === 1 ? `1 verre ajouté · ${fr.format(total)} ml` : `${fr.format(ml)} ml ajoutés · ${fr.format(total)} ml`,
      undo: async () => {
        await db.runAsync("DELETE FROM hydration_log WHERE id = ?", id);
        await load();
      },
      redo: async () => {
        id = (await db.runAsync("INSERT INTO hydration_log (day, ml) VALUES (?, ?)", data.day, ml)).lastInsertRowId;
        await load();
      },
    });
  };

  const findDose = async (treatmentId: number, day: string, slot: number) =>
    (
      await db.getFirstAsync<{ id: number }>(
        "SELECT id FROM treatment_doses WHERE treatment_id = ? AND day = ? AND slot = ? AND undone_at IS NULL",
        treatmentId,
        day,
        slot,
      )
    )?.id ?? null;

  const logWithUndo = async (s: TreatmentState, day: string, slot: number, status: DoseStatus, message: string) => {
    await logDose(db, s, day, slot, status);
    load();
    const undo = async () => {
      const id = await findDose(s.treatment.id, day, slot);
      if (id !== null) await undoDose(db, id);
      await load();
    };
    snackbar.show({
      message,
      undo,
      redo: async () => {
        await logDose(db, s, day, slot, status);
        await load();
      },
    });
  };

  const toggleDose = async ({ state: s, day, slot, dose }: DoseTap) => {
    if (!data || stale()) return;
    const name = s.treatment.name;
    // Optimistic: the box changes with the tap.
    const doses = dose
      ? s.doses.filter((d) => d.id !== dose.id)
      : [...s.doses, { id: -1, day, slot, status: "taken" as const, qty: 0, takenAt: new Date().toISOString(), note: null }];
    setData({ ...data, treatments: data.treatments.map((x) => (x === s ? { ...x, doses } : x)) });
    if (!dose) {
      haptics.success();
      await logWithUndo(s, day, slot, "taken", `${name} : fait`);
      return;
    }
    haptics.tap();
    await undoDose(db, dose.id);
    load();
    snackbar.show({
      message: `${name} : ${dose.status === "taken" ? "décoché" : "« manqué » retiré"}`,
      undo: async () => {
        await logDose(db, s, day, slot, dose.status);
        await load();
      },
      redo: async () => {
        const id = await findDose(s.treatment.id, day, slot);
        if (id !== null) await undoDose(db, id);
        await load();
      },
    });
  };

  const pickNight = async (bucket: Bucket | null) => {
    if (!data || stale()) return;
    const before = data.tonight;
    setData({ ...data, tonight: bucket });
    await setNight(db, data.day, bucket);
    load();
    snackbar.show({
      message: bucket === null ? "Nuit effacée" : `Nuit enregistrée · ${SLEEP_BUCKETS[bucket]}`,
      undo: async () => {
        await setNight(db, data.day, before);
        await load();
      },
      redo: async () => {
        await setNight(db, data.day, bucket);
        await load();
      },
    });
  };

  const startWorkout = () => {
    if (!data?.session) return;
    runner.start(data.session.id, data.session.data);
    router.push("/seance");
  };

  // ── layout ──

  const has = useMemo<Record<TileId, boolean> | null>(
    () =>
      data && {
        hydration: true,
        treatments: data.treatments.length > 0,
        sleep: true,
        workout: !!data.session,
        dinner: !!data.plan,
        savings: data.wishlist.items.some((i) => i.status === "wanted"),
        hair: true,
        money: data.moneyAlerts.length > 0,
      },
    [data],
  );
  const visible = useMemo(() => (has ? layout.filter((e) => has[e.id]) : []), [has, layout]);

  // ── edit mode (long press on a tile, the pencil or the icon menu) ──

  const startEditing = () => {
    if (editing) return;
    haptics.impact();
    setEditing(true);
  };

  // Leaving the tab or pressing back ends edit mode.
  useFocusEffect(useCallback(() => () => setEditing(false), []));
  useEffect(() => {
    if (!editing || Platform.OS === "web") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setEditing(false);
      return true;
    });
    return () => sub.remove();
  }, [editing]);

  const saveLayout = (next: LayoutEntry[]) => {
    setLayout(next);
    writeSetting(db, "today_tiles", serializeLayout(next)).catch(console.warn);
  };

  /** Puts tile `id` in the place of `target` (the others shift). */
  const dropTile = (id: TileId, target: string) => {
    const from = layout.findIndex((e) => e.id === id);
    const to = layout.findIndex((e) => e.id === target);
    if (from < 0 || to < 0) return;
    haptics.success();
    saveLayout(moveTile(layout, from, to));
  };

  const removeTile = (id: TileId) => {
    const before = layout;
    haptics.impact();
    saveLayout(layout.filter((e) => e.id !== id));
    snackbar.show({ message: `${TILES[id].title} retiré du tableau`, undo: () => saveLayout(before) });
  };

  const resizeTile = (id: TileId, size: TileSize) => {
    haptics.tap();
    saveLayout(layout.map((e) => (e.id === id ? { ...e, size } : e)));
  };

  const addTile = () =>
    actions.open(
      "Ajouter un bloc",
      availableTiles(layout).map((id) => ({
        icon: TILES[id].icon as IconName,
        label: TILES[id].title,
        hint: has?.[id] === false ? "Apparaîtra dès qu'il aura du contenu" : TILES[id].describe[TILES[id].sizes[0]],
        onPress: () => {
          haptics.success();
          saveLayout([...layout, { id, size: TILES[id].sizes[0] }]);
        },
      })),
    );

  /** Tile boxes in page coordinates, from the rows' and tiles' layouts (only the tiles shown). */
  const syncFrames = () => {
    const { rows, tiles } = boxes.current;
    const shown = new Set(visible.map((e) => e.id));
    frames.value = Object.fromEntries(
      Object.entries(tiles)
        .filter(([id, b]) => shown.has(id as TileId) && rows[b.row] !== undefined)
        .map(([id, b]) => [id, { x: b.x, y: rows[b.row], w: b.w, h: b.h }]),
    );
  };
  const rows = tileRows(visible);
  const empty = !!data && !visible.some((e) => ["treatments", "workout", "dinner", "savings"].includes(e.id));

  const blobs: Blob[] = [{ domain: "encre", cx: 0.5, cy: 40, rx: 0.84, ry: 154 }];
  rows.forEach((row, i) => {
    const box = rowsLayout[i];
    if (!box) return;
    row.forEach((entry, j) => {
      const domain = TILES[entry.id].domain;
      const half = row.length > 1 || entry.size === "half";
      blobs.push({
        domain,
        cx: half ? (j === 0 ? 0.16 : 0.86) : i % 2 ? 0.86 : 0.18,
        cy: box.y + box.h * 0.45,
        rx: half ? 0.42 : 0.56,
        ry: Math.max(160, box.h * 0.8),
      });
    });
  });
  const washHeight = Math.max(600, ...blobs.map((b) => b.cy + b.ry));

  const summary = (() => {
    if (!data) return " ";
    const { expected, logged } = dayProgress(data.treatments, data.day);
    const left = expected - logged;
    const rest: string[] = [];
    if (left) rest.push(`${left} prise${left > 1 ? "s" : ""}`);
    if (data.tonight === null) rest.push("ta nuit");
    if (data.session && !data.session.rpe) rest.push("la séance");
    if (empty && data.ml === 0 && data.tonight === null) return "Premier jour : commence quand tu veux";
    return rest.length ? `Reste : ${rest.join(" · ")}` : "Tout est noté pour aujourd'hui";
  })();

  const now = new Date();
  const date = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <Screen
      title="Aujourd'hui"
      subtitle={date.charAt(0).toUpperCase() + date.slice(1)}
      domain="encre"
      icon="calendar-outline"
      menu={[
        ...(data ? [{ icon: "water-outline" as const, label: `Ajouter un verre`, hint: `${data.glass} ml`, onPress: () => addWater(1) }] : []),
        { icon: "create-outline", label: "Modifier le tableau", hint: "Ou appui long sur un bloc", onPress: startEditing },
        { icon: "bulb-outline", label: "Noter une idée", onPress: () => router.push({ pathname: "/capture", params: { from: "/" } }) },
        { icon: "bug-outline", label: "Signaler un bug", onPress: () => router.push({ pathname: "/capture", params: { from: "/", kind: "bug" } }) },
        { icon: "options-outline", label: "Réglages", onPress: () => router.push("/plus/reglages") },
      ]}
      backdrop={<BlobWash blobs={blobs} height={washHeight} />}
      right={
        editing ? (
          <>
            <IconButton icon="list-outline" label="Liste détaillée des blocs" onPress={() => router.push("/personnaliser")} />
            <IconButton icon="checkmark" label="Terminer la modification" onPress={() => setEditing(false)} />
          </>
        ) : (
          <>
            <IconButton icon="bulb-outline" label="Noter une idée ou un bug" onPress={() => router.push({ pathname: "/capture", params: { from: "/" } })} />
            <IconButton icon="pencil-outline" label="Modifier le tableau" onPress={startEditing} />
          </>
        )
      }
    >
      <Txt variant="callout" tone={editing ? "accent" : "muted"} numberOfLines={2} style={{ paddingHorizontal: space.xs, marginTop: -space.xs }}>
        {editing ? "Maintiens un bloc puis glisse-le. Coins : retirer, agrandir ou réduire." : summary}
      </Txt>

      {!data ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : (
        rows.map((row, i) => {
          const key = row.map((e) => e.id).join("-");
          return (
            <TileRowView
              key={key}
              ids={row.map((e) => e.id)}
              dragged={dragged}
              onLayout={(e) => {
                const { y, height } = e.nativeEvent.layout;
                setRowsLayout((prev) => (prev[i]?.y === y && prev[i]?.h === height ? prev : { ...prev, [i]: { y, h: height } }));
                boxes.current.rows[key] = y;
                syncFrames();
              }}
            >
              {row.map((entry) => {
                const at = visible.indexOf(entry);
                return (
                  <EditableTile
                    key={entry.id}
                    entry={entry}
                    editing={editing}
                    first={at === 0}
                    last={at === visible.length - 1}
                    frames={frames}
                    dragged={dragged}
                    over={over}
                    onEdit={startEditing}
                    onDrop={(target) => dropTile(entry.id, target)}
                    onRemove={() => removeTile(entry.id)}
                    onResize={(size) => resizeTile(entry.id, size)}
                    onMoveBy={(step) => {
                      const neighbour = visible[at + step];
                      if (neighbour) dropTile(entry.id, neighbour.id);
                    }}
                    onLayout={(e) => {
                      const { x, width, height } = e.nativeEvent.layout;
                      boxes.current.tiles[entry.id] = { row: key, x, w: width, h: height };
                      syncFrames();
                    }}
                  >
                    {renderTile(entry, i)}
                  </EditableTile>
                );
              })}
              {row.length === 1 && row[0].size === "half" ? <View style={{ flex: 1 }} /> : null}
            </TileRowView>
          );
        })
      )}

      {editing && availableTiles(layout).length ? <AddRow label="Ajouter un bloc" hint="Les blocs retirés et ceux jamais ajoutés" onPress={addTile} /> : null}

      {empty ? (
        <Card>
          <EmptyState
            icon="grid-outline"
            title="Ton tableau se remplira"
            body="Ajoute un traitement ou importe une séance : leurs tuiles apparaîtront ici, à côté de l'eau et du sommeil."
          />
        </Card>
      ) : null}
      {actions.sheet}
    </Screen>
  );

  function renderTile(entry: LayoutEntry, index: number) {
    if (!data) return null;
    switch (entry.id) {
      case "hydration":
        return (
          <HydrationTile
            size={entry.size}
            index={index}
            ml={data.ml}
            goal={data.goal}
            glass={data.glass}
            hint={Date.now() - lastWaterAt < 60_000 ? "ajouté à l'instant" : data.nextReminder ? `prochain rappel ${data.nextReminder}` : null}
            onAdd={addWater}
          />
        );
      case "treatments":
        return (
          <TreatmentsTile
            index={index}
            states={data.treatments}
            day={data.day}
            yesterday={addDays(data.day, -1)}
            onToggle={toggleDose}
            onYesterday={(s, slot, status) => {
              if (stale()) return;
              haptics.success();
              logWithUndo(s, addDays(data.day, -1), slot, status, `${s.treatment.name} : hier noté ${status === "taken" ? "pris" : "manqué"}`);
            }}
            onAsNeeded={(s) => {
              if (stale()) return;
              haptics.success();
              const next = Math.max(0, ...s.doses.filter((d) => d.day === data.day).map((d) => d.slot)) + 1;
              logWithUndo(s, data.day, next, "taken", `${s.treatment.name} : prise ajoutée`);
            }}
          />
        );
      case "sleep":
        return <SleepTile index={index} day={data.day} nights={data.nights} tonight={data.tonight} onPick={pickNight} />;
      case "workout":
        return data.session ? (
          <WorkoutTile
            size={entry.size}
            index={index}
            session={data.session}
            rpe={data.session.rpe}
            yesterday={data.yesterdaySession}
            run={runner.run}
            remaining={runner.remaining}
            onStart={startWorkout}
          />
        ) : null;
      case "dinner":
        return data.plan ? <DinnerTile size={entry.size} index={index} plan={data.plan} day={data.day} /> : null;
      case "savings":
        return <SavingsTile size={entry.size} index={index} wishlist={data.wishlist} day={data.day} />;
      case "hair":
        return <HairTile size={entry.size} index={index} hair={data.hair} day={data.day} />;
      case "money":
        return <MoneyTile index={index} alerts={data.moneyAlerts} />;
    }
  }
}
