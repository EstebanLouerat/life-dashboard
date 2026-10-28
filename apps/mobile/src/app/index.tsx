import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import { Body, Button, Card, Screen, useTheme } from "@/components/ui";
import { hoursBetween, today } from "@/lib/dates";

type OpenSleep = { id: number; bed_at: string } | null;

export default function TodayScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const [ml, setMl] = useState(0);
  const [goal, setGoal] = useState(2000);
  const [glass, setGlass] = useState(250);
  const [openSleep, setOpenSleep] = useState<OpenSleep>(null);
  const [lastNight, setLastNight] = useState<number | null>(null);

  const load = useCallback(async () => {
    const water = await db.getFirstAsync<{ total: number | null }>(
      "SELECT SUM(ml) AS total FROM hydration_log WHERE day = ?",
      today(),
    );
    setMl(water?.total ?? 0);

    const settings = await db.getAllAsync<{ key: string; value: string }>("SELECT key, value FROM settings");
    const s = Object.fromEntries(settings.map((r) => [r.key, Number(r.value)]));
    setGoal(s.hydration_goal_ml ?? 2000);
    setGlass(s.glass_ml ?? 250);

    setOpenSleep(
      await db.getFirstAsync<{ id: number; bed_at: string }>(
        "SELECT id, bed_at FROM sleep_log WHERE wake_at IS NULL ORDER BY id DESC LIMIT 1",
      ),
    );
    const last = await db.getFirstAsync<{ bed_at: string; wake_at: string }>(
      "SELECT bed_at, wake_at FROM sleep_log WHERE wake_at IS NOT NULL ORDER BY id DESC LIMIT 1",
    );
    setLastNight(last ? hoursBetween(last.bed_at, last.wake_at) : null);
  }, [db]);

  useEffect(() => {
    load();
  }, [load]);

  const addWater = async (amount: number) => {
    await db.runAsync("INSERT INTO hydration_log (day, ml) VALUES (?, ?)", today(), amount);
    load();
  };

  const undoWater = async () => {
    await db.runAsync(
      "DELETE FROM hydration_log WHERE id = (SELECT MAX(id) FROM hydration_log WHERE day = ?)",
      today(),
    );
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
    await db.runAsync(
      "UPDATE sleep_log SET quality = ? WHERE id = (SELECT MAX(id) FROM sleep_log WHERE wake_at IS NOT NULL)",
      quality,
    );
  };

  const pct = Math.min(1, ml / goal);

  return (
    <Screen>
      <Card title="Hydratation">
        <Text style={{ color: t.text, fontSize: 32, fontWeight: "800" }}>
          {(ml / 1000).toFixed(2)} L <Text style={{ color: t.muted, fontSize: 18 }}>/ {(goal / 1000).toFixed(1)} L</Text>
        </Text>
        <View style={{ height: 10, borderRadius: 5, backgroundColor: t.border, overflow: "hidden" }}>
          <View style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: pct >= 1 ? t.good : t.accent }} />
        </View>
        <Button label={`+ 1 verre (${glass} ml)`} onPress={() => addWater(glass)} />
        <Button label="Annuler le dernier" variant="secondary" onPress={undoWater} disabled={ml === 0} />
      </Card>

      <Card title="Sommeil">
        <Body muted>
          {openSleep
            ? `Couché à ${new Date(openSleep.bed_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
            : lastNight != null
              ? `Dernière nuit : ${lastNight.toFixed(1)} h`
              : "Aucune nuit enregistrée"}
        </Body>
        <Button label={openSleep ? "Je me lève" : "Je me couche"} onPress={toggleSleep} />
        {!openSleep && lastNight != null ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[1, 2, 3, 4, 5].map((q) => (
              <View key={q} style={{ flex: 1 }}>
                <Button label={String(q)} variant="secondary" onPress={() => rateSleep(q)} />
              </View>
            ))}
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}
