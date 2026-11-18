import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSQLiteContext } from "expo-sqlite";
import { GroceryPlan, type Aisle, type GroceryRequest, type Store } from "@ld/contracts";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  popIn,
  PressableScale,
  ProgressBar,
  radius,
  Screen,
  SectionTitle,
  Segmented,
  space,
  Txt,
  useTheme,
} from "@/components/ui";
import { api } from "@/lib/api";
import { haptics } from "@/lib/haptics";

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

const euros = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

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
      haptics.success();
    } catch (e) {
      haptics.warning();
      Alert.alert("Génération impossible", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggle = async (name: string) => {
    if (!plan) return;
    // Shown on the tap, with the haptic; the write follows.
    haptics.tap();
    const next = new Set(checked);
    const wasChecked = next.has(name);
    if (wasChecked) next.delete(name);
    else next.add(name);
    setChecked(next);
    if (wasChecked) {
      await db.runAsync("DELETE FROM grocery_checks WHERE plan_id = ? AND item_name = ?", plan.id, name);
    } else {
      await db.runAsync("INSERT OR IGNORE INTO grocery_checks (plan_id, item_name) VALUES (?, ?)", plan.id, name);
    }
  };

  const byAisle = useMemo(() => {
    if (!plan) return [];
    return AISLE_ORDER.map((aisle) => ({
      aisle,
      items: plan.data.items.filter((i) => i.aisle === aisle),
    })).filter((g) => g.items.length > 0);
  }, [plan]);

  const total = plan?.data.items.length ?? 0;

  return (
    <Screen back title="Courses" subtitle="Menu de la semaine et liste par rayon">
      <Card title="Nouvelle semaine" icon="sparkles" color="courses" index={0}>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field label="Jours" value={days} onChangeText={setDays} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Personnes" value={people} onChangeText={setPeople} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Budget (€)" value={budget} onChangeText={setBudget} keyboardType="number-pad" />
          </View>
        </View>
        <Segmented
          value={store}
          onChange={setStore}
          options={[
            { value: "lidl", label: "Lidl" },
            { value: "auchan", label: "Auchan" },
          ]}
        />
        <Field label="Préférences (facultatif)" value={prefs} onChangeText={setPrefs} placeholder="ex. pas de poisson, 20 min max" />
        <Button label="Générer menu et liste" icon="sparkles" onPress={generate} loading={loading} />
      </Card>

      {plan ? (
        <>
          <Card
            title="Liste"
            subtitle={`${checked.size}/${total} dans le panier`}
            icon="cart"
            color="courses"
            index={1}
            right={<Badge label={`≈ ${euros(plan.data.totalEstEur)}`} color={plan.data.withinBudget ? "sante" : "warning"} />}
          >
            <ProgressBar value={total ? checked.size / total : 0} color={t.domain.courses.accentText} label="Articles cochés" />
            <Txt variant="caption" tone="muted">
              {plan.data.withinBudget ? "Dans le budget" : "Au-dessus du budget"} · prix estimés, à affiner avec tes tickets
            </Txt>
            {byAisle.map((g) => (
              <View key={g.aisle} style={{ gap: space.xs }}>
                <SectionTitle>{AISLE_LABEL[g.aisle]}</SectionTitle>
                {g.items.map((item) => {
                  const done = checked.has(item.name);
                  return (
                    <PressableScale
                      key={item.name}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: done }}
                      accessibilityLabel={`${item.name}, ${item.quantity}`}
                      onPress={() => toggle(item.name)}
                      style={{ flexDirection: "row", gap: space.md, alignItems: "center", minHeight: 48 }}
                    >
                      <View
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: radius.sm - 2,
                          borderWidth: done ? 0 : 2,
                          borderColor: t.textMuted,
                          backgroundColor: done ? t.domain.courses.accentText : "transparent",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {done ? (
                          <Animated.View entering={popIn}>
                            <Icon name="checkmark" size={18} color={t.dark ? t.bg : t.domain.encre.onAccent} />
                          </Animated.View>
                        ) : null}
                      </View>
                      <View style={{ flex: 1, opacity: done ? 0.55 : 1 }}>
                        <Txt variant="bodyStrong" style={{ textDecorationLine: done ? "line-through" : "none" }}>
                          {item.name}
                        </Txt>
                        <Txt variant="caption" tone="muted">
                          {item.quantity}
                        </Txt>
                      </View>
                      <Txt variant="callout" tone="muted">
                        {euros(item.estPriceEur)}
                      </Txt>
                    </PressableScale>
                  );
                })}
              </View>
            ))}
          </Card>

          <Card title="Menu" icon="restaurant" color="courses" index={2}>
            {plan.data.meals.map((m) => (
              <View key={`${m.day}-${m.slot}`} style={{ flexDirection: "row", gap: space.md, alignItems: "center", minHeight: 48 }}>
                <Badge label={`J${m.day}`} color="courses" />
                <Icon name={m.slot === "dejeuner" ? "sunny-outline" : "moon-outline"} size={18} color={t.textMuted} />
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong">{m.title}</Txt>
                  <Txt variant="caption" tone="muted">
                    {m.slot === "dejeuner" ? "Midi" : "Soir"} · {m.prepMinutes} min
                  </Txt>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : (
        <Card index={1}>
          <EmptyState icon="cart-outline" title="Pas encore de liste" body="Règle la semaine puis génère un menu et sa liste de courses." />
        </Card>
      )}
    </Screen>
  );
}

function clamp(n: number, min: number, max: number) {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min;
}
