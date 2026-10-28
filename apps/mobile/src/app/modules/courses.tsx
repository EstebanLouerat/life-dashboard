import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import { GroceryPlan, type Aisle, type GroceryRequest, type Store } from "@ld/contracts";
import { Body, Button, Card, Chips, Field, Screen, useTheme } from "@/components/ui";
import { api } from "@/lib/api";

const AISLE_LABEL: Record<Aisle, string> = {
  "fruits-legumes": "Fruits & légumes",
  boulangerie: "Boulangerie",
  cremerie: "Crèmerie",
  "viandes-poissons": "Viandes & poissons",
  "epicerie-salee": "Épicerie salée",
  "epicerie-sucree": "Épicerie sucrée",
  surgeles: "Surgelés",
  boissons: "Boissons",
  "hygiene-entretien": "Hygiène & entretien",
  autre: "Autre",
};
const AISLE_ORDER = Object.keys(AISLE_LABEL) as Aisle[];

export default function CoursesScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const [days, setDays] = useState("5");
  const [people, setPeople] = useState("1");
  const [budget, setBudget] = useState("60");
  const [store, setStore] = useState<Store>("lidl");
  const [prefs, setPrefs] = useState("");
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<{ id: number; data: GroceryPlan } | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const loadLatest = useCallback(async () => {
    const row = await db.getFirstAsync<{ id: number; plan_json: string }>(
      "SELECT id, plan_json FROM grocery_plans ORDER BY id DESC LIMIT 1",
    );
    if (!row) return;
    setPlan({ id: row.id, data: GroceryPlan.parse(JSON.parse(row.plan_json)) });
    const checks = await db.getAllAsync<{ item_name: string }>(
      "SELECT item_name FROM grocery_checks WHERE plan_id = ?",
      row.id,
    );
    setChecked(new Set(checks.map((c) => c.item_name)));
  }, [db]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  const generate = async () => {
    const input: GroceryRequest = {
      days: clamp(Number(days), 1, 7),
      people: clamp(Number(people), 1, 6),
      budgetEur: clamp(Number(budget), 10, 300),
      store,
      mealsPerDay: ["dejeuner", "diner"],
      preferences: prefs || undefined,
      pantry: [],
      knownPrices: [],
    };
    setLoading(true);
    try {
      const data = await api.groceries(input);
      const res = await db.runAsync(
        "INSERT INTO grocery_plans (request_json, plan_json) VALUES (?, ?)",
        JSON.stringify(input),
        JSON.stringify(data),
      );
      setPlan({ id: res.lastInsertRowId, data });
      setChecked(new Set());
    } catch (e) {
      Alert.alert("Génération impossible", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggle = async (name: string) => {
    if (!plan) return;
    const next = new Set(checked);
    if (next.has(name)) {
      next.delete(name);
      await db.runAsync("DELETE FROM grocery_checks WHERE plan_id = ? AND item_name = ?", plan.id, name);
    } else {
      next.add(name);
      await db.runAsync("INSERT OR IGNORE INTO grocery_checks (plan_id, item_name) VALUES (?, ?)", plan.id, name);
    }
    setChecked(next);
  };

  const byAisle = useMemo(() => {
    if (!plan) return [];
    return AISLE_ORDER.map((aisle) => ({
      aisle,
      items: plan.data.items.filter((i) => i.aisle === aisle),
    })).filter((g) => g.items.length > 0);
  }, [plan]);

  return (
    <Screen>
      <Card title="Nouvelle semaine">
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Field label="Jours" value={days} onChangeText={setDays} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Field label="Personnes" value={people} onChangeText={setPeople} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Field label="Budget €" value={budget} onChangeText={setBudget} keyboardType="number-pad" /></View>
        </View>
        <Chips
          value={store}
          onChange={setStore}
          options={[{ value: "lidl", label: "Lidl" }, { value: "auchan", label: "Auchan" }]}
        />
        <Field label="Préférences (facultatif)" value={prefs} onChangeText={setPrefs} placeholder="ex. pas de poisson, 20 min max" />
        <Button label="Générer menu + liste" onPress={generate} loading={loading} />
      </Card>

      {plan ? (
        <>
          <Card title={`Liste · ~${plan.data.totalEstEur.toFixed(2)} €`}>
            <Body muted>
              {plan.data.withinBudget ? "Dans le budget" : "⚠️ Au-dessus du budget"} · prix estimés, à affiner avec tes tickets
            </Body>
            {byAisle.map((g) => (
              <View key={g.aisle} style={{ gap: 6 }}>
                <Text style={{ color: t.muted, fontWeight: "700", marginTop: 6 }}>{AISLE_LABEL[g.aisle]}</Text>
                {g.items.map((item) => {
                  const done = checked.has(item.name);
                  return (
                    <Pressable key={item.name} onPress={() => toggle(item.name)} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                      <Text style={{ fontSize: 18 }}>{done ? "☑️" : "⬜️"}</Text>
                      <Text style={{ flex: 1, color: done ? t.muted : t.text, textDecorationLine: done ? "line-through" : "none" }}>
                        {item.name} · {item.quantity}
                      </Text>
                      <Text style={{ color: t.muted }}>{item.estPriceEur.toFixed(2)} €</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </Card>

          <Card title="Menu">
            {plan.data.meals.map((m) => (
              <Body key={`${m.day}-${m.slot}`}>
                J{m.day} {m.slot === "dejeuner" ? "midi" : "soir"} · {m.title} ({m.prepMinutes} min)
              </Body>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function clamp(n: number, min: number, max: number) {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min;
}
