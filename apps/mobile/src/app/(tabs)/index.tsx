import { useCallback, useState } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  Badge,
  Button,
  Card,
  entering,
  font,
  Icon,
  popIn,
  IconButton,
  ProgressBar,
  radius,
  Ring,
  Screen,
  Segmented,
  space,
  Txt,
  useTheme,
} from "@/components/ui";
import { dayProgress, TreatmentsToday } from "@/components/TreatmentsToday";
import { MoneyToday } from "@/components/MoneyToday";
import { HairCheckToday } from "@/components/HairCheckToday";
import { hoursBetween, today } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
import { refreshHairChecks, type HairState } from "@/lib/hairChecks";
import { refreshTreatments, type TreatmentState } from "@/lib/treatments";
import { refreshSubscriptions, subscriptionAlerts, type MoneyAlert } from "@/lib/subscriptions";
import { refreshWishlist, wishlistAlerts } from "@/lib/wishlist";

type OpenSleep = { id: number; bed_at: string } | null;
type LastNight = { id: number; hours: number; quality: number | null; wakeAt: string } | null;

const SLEEP_TARGET_HOURS = 8;
/** A wake-up logged this recently can still be undone from Today (a slip, not a real night). */
const UNDO_WAKE_MS = 60 * 60 * 1000;

function greeting(hour: number) {
  if (hour < 5) return "Bonne nuit";
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

function formatHours(h: number) {
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, "0")}`;
}

const litres = (ml: number) => (ml / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

export default function TodayScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const [ml, setMl] = useState(0);
  const [goal, setGoal] = useState(2000);
  const [glass, setGlass] = useState(250);
  const [openSleep, setOpenSleep] = useState<OpenSleep>(null);
  const [lastNight, setLastNight] = useState<LastNight>(null);
  const [treatments, setTreatments] = useState<TreatmentState[]>([]);
  const [moneyAlerts, setMoneyAlerts] = useState<MoneyAlert[]>([]);
  const [hair, setHair] = useState<HairState | null>(null);

  const load = useCallback(async () => {
    const water = await db.getFirstAsync<{ total: number | null }>(
      "SELECT SUM(ml) AS total FROM hydration_log WHERE day = ?",
      today(),
    );
    setMl(water?.total ?? 0);

    const settings = await db.getAllAsync<{ key: string; value: string }>("SELECT key, value FROM settings");
    const s = Object.fromEntries(settings.map((r) => [r.key, Number(r.value)]));
    setGoal(s.hydration_goal_ml || 2000);
    setGlass(s.glass_ml || 250);

    setOpenSleep(
      await db.getFirstAsync<{ id: number; bed_at: string }>(
        "SELECT id, bed_at FROM sleep_log WHERE wake_at IS NULL ORDER BY id DESC LIMIT 1",
      ),
    );
    const last = await db.getFirstAsync<{ id: number; bed_at: string; wake_at: string; quality: number | null }>(
      "SELECT id, bed_at, wake_at, quality FROM sleep_log WHERE wake_at IS NOT NULL ORDER BY id DESC LIMIT 1",
    );
    setLastNight(
      last ? { id: last.id, hours: hoursBetween(last.bed_at, last.wake_at), quality: last.quality, wakeAt: last.wake_at } : null,
    );

    setTreatments(await refreshTreatments(db));
    setHair(await refreshHairChecks(db));
    const [subs, wishlist] = await Promise.all([refreshSubscriptions(db), refreshWishlist(db)]);
    setMoneyAlerts([...subscriptionAlerts(subs), ...wishlistAlerts(wishlist)]);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // The glass shows on the tap, with the haptic; the write and reload follow.
  const addWater = async () => {
    if (ml < goal && ml + glass >= goal) haptics.success();
    else haptics.impact();
    setMl((v) => v + glass);
    await db.runAsync("INSERT INTO hydration_log (day, ml) VALUES (?, ?)", today(), glass);
    load();
  };

  const undoWater = async () => {
    await db.runAsync(
      "DELETE FROM hydration_log WHERE id = (SELECT MAX(id) FROM hydration_log WHERE day = ?)",
      today(),
    );
    load();
  };

  const undoBedtime = async () => {
    if (!openSleep) return;
    await db.runAsync("DELETE FROM sleep_log WHERE id = ?", openSleep.id);
    load();
  };

  const undoWake = async () => {
    if (!lastNight) return;
    await db.runAsync("UPDATE sleep_log SET wake_at = NULL WHERE id = ?", lastNight.id);
    load();
  };

  const toggleSleep = async () => {
    const now = new Date().toISOString();
    if (openSleep) {
      await db.runAsync("UPDATE sleep_log SET wake_at = ? WHERE id = ?", now, openSleep.id);
    } else {
      await db.runAsync("INSERT INTO sleep_log (bed_at) VALUES (?)", now);
    }
    load();
  };

  const rateSleep = async (quality: number) => {
    if (!lastNight) return;
    await db.runAsync("UPDATE sleep_log SET quality = ? WHERE id = ?", quality, lastNight.id);
    setLastNight({ ...lastNight, quality });
  };

  const now = new Date();
  const wakeUndoable = !openSleep && !!lastNight && now.getTime() - Date.parse(lastNight.wakeAt) < UNDO_WAKE_MS;
  const { expected, logged } = dayProgress(treatments, today());
  const left = expected - logged;
  const glasses = Math.min(12, Math.max(1, Math.ceil(goal / glass)));
  const filled = Math.floor(ml / glass);
  const summary =
    expected === 0
      ? "Aucun traitement prévu aujourd'hui"
      : left > 0
        ? `${left} prise${left > 1 ? "s" : ""} à pointer`
        : "Tous les traitements sont pointés";

  return (
    <Screen
      overline={now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
      title={greeting(now.getHours())}
      subtitle={summary}
      right={
        <IconButton
          icon="bulb-outline"
          label="Noter une idée ou un bug"
          onPress={() => router.push({ pathname: "/capture", params: { from: "/" } })}
        />
      }
    >
      <Animated.View entering={entering(0)}>
        <LinearGradient
          colors={t.heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: radius.xl, padding: space.xl, flexDirection: "row", justifyContent: "space-between" }}
        >
          <HeroRing label="Traitements" value={expected ? logged / expected : 0} text={expected ? `${logged}/${expected}` : "—"} />
          <HeroRing label="Eau" value={ml / goal} text={`${litres(ml)} L`} />
          <HeroRing
            label="Sommeil"
            value={lastNight ? lastNight.hours / SLEEP_TARGET_HOURS : 0}
            text={lastNight ? `${lastNight.hours.toFixed(1).replace(".", ",")} h` : "—"}
          />
        </LinearGradient>
      </Animated.View>

      <TreatmentsToday states={treatments} onChanged={load} index={1} />

      <HairCheckToday state={hair} index={2} />

      <MoneyToday alerts={moneyAlerts} index={3} />

      <Card
        title="Hydratation"
        icon="water"
        color="water"
        index={4}
        right={<Badge label={`${Math.round(Math.min(1, ml / goal) * 100)} %`} color={ml >= goal ? "success" : "water"} />}
      >
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.xs }}>
          <Txt variant="number">{litres(ml)} L</Txt>
          <Txt variant="callout" tone="muted">
            / {litres(goal)} L
          </Txt>
        </View>
        <ProgressBar value={ml / goal} color={ml >= goal ? t.success : t.module.water.solid} height={10} label="Objectif d'hydratation" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {Array.from({ length: glasses }, (_, i) => {
            const full = i < filled;
            return (
              <Animated.View key={`${i}-${full}`} entering={full ? popIn : undefined}>
                <Icon name={full ? "water" : "water-outline"} size={22} color={full ? t.module.water.solid : t.textMuted} />
              </Animated.View>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Button label={`Un verre · ${glass} ml`} icon="add" onPress={addWater} />
          </View>
          <IconButton icon="arrow-undo" label="Annuler le dernier verre" onPress={undoWater} disabled={ml === 0} />
        </View>
      </Card>

      <Card title="Sommeil" icon="moon" color="sleep" index={5}>
        {openSleep ? (
          <View style={{ gap: 2 }}>
            <Txt variant="number">
              {new Date(openSleep.bed_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </Txt>
            <Txt variant="caption" tone="muted">
              Couché depuis {formatHours(hoursBetween(openSleep.bed_at, new Date().toISOString()))}
            </Txt>
          </View>
        ) : lastNight ? (
          <>
            <View style={{ gap: 2 }}>
              <Txt variant="number">{formatHours(lastNight.hours)}</Txt>
              <Txt variant="caption" tone="muted">
                Dernière nuit
              </Txt>
            </View>
            <View style={{ gap: space.sm }}>
              <Txt variant="caption" tone="muted">
                Qualité ressentie
              </Txt>
              <Segmented
                options={["1", "2", "3", "4", "5"].map((q) => ({ value: q, label: q }))}
                value={lastNight.quality ? String(lastNight.quality) : null}
                onChange={(q) => rateSleep(Number(q))}
              />
            </View>
          </>
        ) : (
          <Txt tone="muted">Aucune nuit enregistrée.</Txt>
        )}
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label={openSleep ? "Je me lève" : "Je me couche"}
              icon={openSleep ? "sunny" : "moon"}
              variant={openSleep ? "primary" : "secondary"}
              haptic
              onPress={toggleSleep}
            />
          </View>
          {openSleep ? (
            <IconButton icon="arrow-undo" label="Annuler le coucher" onPress={undoBedtime} />
          ) : wakeUndoable ? (
            <IconButton icon="arrow-undo" label="Annuler le réveil" onPress={undoWake} />
          ) : null}
        </View>
      </Card>
    </Screen>
  );
}

function HeroRing({ label, value, text }: { label: string; value: number; text: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", gap: space.sm, flex: 1 }}>
      <Ring value={value} size={78} stroke={8} color={t.onHero} trackColor={t.heroTrack} label={label}>
        <Txt variant="callout" tone="inverse" style={{ fontFamily: font.extrabold, fontVariant: ["tabular-nums"] }} numberOfLines={1} adjustsFontSizeToFit>
          {text}
        </Txt>
      </Ring>
      <Txt variant="caption" tone="inverse">
        {label}
      </Txt>
    </View>
  );
}
