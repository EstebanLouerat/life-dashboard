import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { GroceryPlan, GroceryRequest, WorkoutSession } from "@ld/contracts";
import { BlobWash, Card, EmptyState, IconButton, Screen, SkeletonCard, space, Txt, useSnackbar, type Blob } from "@/components/ui";
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
import { parseLayout, TILES, tileRows, type LayoutEntry } from "@/lib/dashboard";
import { addDays, today } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
import { refreshHairChecks, type HairState } from "@/lib/hairChecks";
import { loadNights, setNight } from "@/lib/nights";
import { intSetting, readSettings } from "@/lib/settings";
import { SLEEP_BUCKETS, type Bucket, type Night } from "@/lib/sleep";
import { isScheduled, type DoseStatus } from "@/lib/stock";
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
    });
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // ── one-tap logs: shown on the tap, written, then confirmed by the reload ──

  const addWater = async (glasses: number) => {
    if (!data) return;
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
    if (!data) return;
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
    if (!data) return;
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

  const visible = useMemo(() => {
    if (!data) return [];
    const has: Record<LayoutEntry["id"], boolean> = {
      hydration: true,
      treatments: data.treatments.length > 0,
      sleep: true,
      workout: !!data.session,
      dinner: !!data.plan,
      savings: data.wishlist.items.some((i) => i.status === "wanted"),
      hair: true,
      money: data.moneyAlerts.length > 0,
    };
    return layout.filter((e) => has[e.id]);
  }, [data, layout]);
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
    const day = data.day;
    let left = 0;
    for (const s of data.treatments) {
      if (!isScheduled(s.regimen, day)) continue;
      const logged = s.doses.filter((d) => d.day === day && d.slot <= s.regimen!.dosesPerDay).length;
      left += Math.max(0, s.regimen!.dosesPerDay - logged);
    }
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
      backdrop={<BlobWash blobs={blobs} height={washHeight} />}
      right={
        <>
          <IconButton icon="bulb-outline" label="Noter une idée ou un bug" onPress={() => router.push({ pathname: "/capture", params: { from: "/" } })} />
          <IconButton icon="pencil-outline" label="Personnaliser le tableau" onPress={() => router.push("/personnaliser")} />
        </>
      }
    >
      <Txt variant="callout" tone="muted" numberOfLines={1} style={{ paddingHorizontal: space.xs, marginTop: -space.xs }}>
        {summary}
      </Txt>

      {!data ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : (
        rows.map((row, i) => (
          <View
            key={row.map((e) => e.id).join("-")}
            onLayout={(e) => {
              const { y, height } = e.nativeEvent.layout;
              setRowsLayout((prev) => (prev[i]?.y === y && prev[i]?.h === height ? prev : { ...prev, [i]: { y, h: height } }));
            }}
            style={{ flexDirection: "row", gap: space.md, alignItems: "stretch" }}
          >
            {row.map((entry) => (
              <View key={entry.id} style={{ flex: 1 }}>
                {renderTile(entry, i)}
              </View>
            ))}
            {row.length === 1 && row[0].size === "half" ? <View style={{ flex: 1 }} /> : null}
          </View>
        ))
      )}

      {empty ? (
        <Card>
          <EmptyState
            icon="grid-outline"
            title="Ton tableau se remplira"
            body="Ajoute un traitement ou importe une séance : leurs tuiles apparaîtront ici, à côté de l'eau et du sommeil."
          />
        </Card>
      ) : null}
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
            hint={Date.now() - lastWaterAt < 60_000 ? "ajouté à l'instant" : null}
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
              haptics.success();
              logWithUndo(s, addDays(data.day, -1), slot, status, `${s.treatment.name} : hier noté ${status === "taken" ? "pris" : "manqué"}`);
            }}
            onAsNeeded={(s) => {
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
