import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { GroceryPlan, GroceryRequest, type Aisle, type Meal, type Store } from "@ld/contracts";
import {
  Badge,
  Button,
  Card,
  CheckMark,
  Chips,
  EmptyState,
  Field,
  IconButton,
  ListRow,
  Notice,
  PressableScale,
  ProgressBar,
  radius,
  Screen,
  SectionTitle,
  Sheet,
  SkeletonCard,
  space,
  Stepper,
  Txt,
  useAccent,
  useTheme,
} from "@/components/ui";
import { AISLE_LABEL, AISLE_ORDER } from "@/lib/aisles";
import { api } from "@/lib/api";
import { addDays, atLocalTime, today } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
import { formatCents } from "@/lib/money";
import { intSetting, readSettings, writeSetting } from "@/lib/settings";

/** Aisles in walking order through the store. */
const STORE_LABEL: Record<Store, string> = { lidl: "Lidl", auchan: "Auchan" };

type Params = { days: number; people: number; budget: number; store: Store };
type Plan = { id: number; data: GroceryPlan; startDay: string };

/** "42,70 €", "60 €". */
function euros(eur: number): string {
  const cents = Math.round(eur * 100);
  return formatCents(cents, cents % 100 === 0);
}

const dayLabel = (day: string, opts: Intl.DateTimeFormatOptions) => atLocalTime(day, 12).toLocaleDateString("fr-FR", opts);

/**
 * The week's dinners and the shopping list in the store's walking order.
 * Known prices (from the user's table) are filled, Claude's estimates are
 * dashed. A plan comes from Claude (header button) or from Importer.
 */
export default function CoursesScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const [params, setParams] = useState<Params | null>(null);
  const [draft, setDraft] = useState<Params | null>(null);
  const [prefs, setPrefs] = useState("");
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [generateSheet, setGenerateSheet] = useState(false);
  const [meal, setMeal] = useState<Meal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = await readSettings(db);
    setParams({
      days: intSetting(s, "courses_days", 7),
      people: intSetting(s, "courses_people", 2),
      budget: intSetting(s, "courses_budget", 60),
      store: s.courses_store === "auchan" ? "auchan" : "lidl",
    });
    const row = await db.getFirstAsync<{ id: number; plan_json: string; start_day: string | null; created_at: string }>(
      "SELECT id, plan_json, start_day, created_at FROM grocery_plans ORDER BY id DESC LIMIT 1",
    );
    const parsed = row ? GroceryPlan.safeParse(JSON.parse(row.plan_json)) : null;
    if (!row || !parsed?.success) {
      setPlan(null);
      return;
    }
    setPlan({ id: row.id, data: parsed.data, startDay: row.start_day ?? today(new Date(`${row.created_at.replace(" ", "T")}Z`)) });
    const checks = await db.getAllAsync<{ item_name: string }>("SELECT item_name FROM grocery_checks WHERE plan_id = ?", row.id);
    setChecked(new Set(checks.map((c) => c.item_name)));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const saveParams = async (next: Params) => {
    setParams(next);
    await Promise.all([
      writeSetting(db, "courses_days", String(next.days)),
      writeSetting(db, "courses_people", String(next.people)),
      writeSetting(db, "courses_budget", String(next.budget)),
      writeSetting(db, "courses_store", next.store),
    ]);
  };

  const generate = async () => {
    if (!params) return;
    const input: GroceryRequest = {
      days: params.days,
      people: params.people,
      budgetEur: params.budget,
      store: params.store,
      mealsPerDay: ["diner"],
      preferences: prefs.trim() || undefined,
      pantry: [],
      knownPrices: [],
    };
    setGenerating(true);
    setError(null);
    try {
      const data = await api.groceries(input);
      const day = today();
      const res = await db.runAsync(
        "INSERT INTO grocery_plans (request_json, plan_json, start_day) VALUES (?, ?, ?)",
        JSON.stringify(input),
        JSON.stringify(data),
        day,
      );
      setPlan({ id: res.lastInsertRowId, data, startDay: day });
      setChecked(new Set());
      setGenerateSheet(false);
      haptics.success();
    } catch (e) {
      haptics.warning();
      setGenerateSheet(false);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const toggle = async (name: string) => {
    if (!plan) return;
    // Shown on the tap, with the haptic; the write follows.
    haptics.tap();
    const next = new Set(checked);
    const was = next.has(name);
    if (was) next.delete(name);
    else next.add(name);
    setChecked(next);
    if (was) await db.runAsync("DELETE FROM grocery_checks WHERE plan_id = ? AND item_name = ?", plan.id, name);
    else await db.runAsync("INSERT OR IGNORE INTO grocery_checks (plan_id, item_name) VALUES (?, ?)", plan.id, name);
  };

  const byAisle = useMemo(
    () =>
      plan
        ? AISLE_ORDER.map((aisle) => ({ aisle, items: plan.data.items.filter((i) => i.aisle === aisle) })).filter((g) => g.items.length > 0)
        : [],
    [plan],
  );

  const week = plan
    ? { from: plan.startDay, to: addDays(plan.startDay, Math.max(...plan.data.meals.map((m) => m.day), 1) - 1) }
    : { from: today(), to: addDays(today(), (params?.days ?? 7) - 1) };
  const subtitle = `Semaine du ${dayLabel(week.from, { day: "numeric" })} au ${dayLabel(week.to, { day: "numeric", month: "short" })}`;
  const paramsLine = params ? `${params.days} dîner${params.days > 1 ? "s" : ""} · ${params.people} personne${params.people > 1 ? "s" : ""}` : "";

  return (
    <Screen
      title="Courses"
      subtitle={subtitle}
      domain="courses"
      right={<IconButton icon="sparkles-outline" label="Générer un nouveau plan" onPress={() => setGenerateSheet(true)} />}
    >
      {error ? (
        <Notice tone="danger" title="Serveur injoignable" action={{ label: "Réessayer", onPress: generate }}>
          {plan ? "Liste affichée depuis le téléphone. Les cases cochées sont gardées." : error}
        </Notice>
      ) : null}

      {plan === undefined || !params ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : (
        <>
          {plan ? (
            <Card title="Paramètres" index={0}>
              <Chips
                fill
                options={[
                  { value: "lidl", label: "Lidl" },
                  { value: "auchan", label: "Auchan" },
                ]}
                value={params.store}
                onChange={(store) => saveParams({ ...params, store })}
              />
              <ListRow
                icon="options-outline"
                title={paramsLine}
                subtitle={`Budget ${euros(params.budget)} · modifier`}
                onPress={() => setDraft(params)}
              />
            </Card>
          ) : null}

          {plan ? (
            <>
              <TotalCard plan={plan.data} budget={params.budget} />

              <SectionTitle right={paramsLine.split(" · ")[1]}>
                Menu · {plan.data.meals.length} dîner{plan.data.meals.length > 1 ? "s" : ""}
              </SectionTitle>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -space.lg, flexGrow: 0 }}
                contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}
              >
                {[...plan.data.meals]
                  .sort((x, y) => x.day - y.day || (x.slot === "dejeuner" ? -1 : 1))
                  .map((m) => (
                    <MealCard key={`${m.day}-${m.slot}`} meal={m} day={addDays(plan.startDay, m.day - 1)} onPress={() => setMeal(m)} />
                  ))}
              </ScrollView>

              <SectionTitle right={`${checked.size} / ${plan.data.items.length} cochés`}>
                Liste · ordre du parcours {STORE_LABEL[params.store]}
              </SectionTitle>
              {byAisle.map((g, i) => (
                <Card key={g.aisle} title={AISLE_LABEL[g.aisle]} right={`${g.items.length} article${g.items.length > 1 ? "s" : ""}`} index={i + 2} style={{ gap: space.xs }}>
                  {g.items.map((item) => {
                    const done = checked.has(item.name);
                    return (
                      <Pressable
                        key={item.name}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: done }}
                        accessibilityLabel={`${item.name}, ${item.quantity}, ${item.priceSource === "known" ? "" : "environ "}${euros(item.estPriceEur)}`}
                        onPress={() => toggle(item.name)}
                        style={({ pressed }) => ({
                          flexDirection: "row",
                          alignItems: "center",
                          gap: space.sm,
                          minHeight: 52,
                          marginHorizontal: -space.sm,
                          paddingRight: space.sm,
                          borderRadius: radius.md,
                          backgroundColor: pressed ? t.surfaceAlt : "transparent",
                        })}
                      >
                        <CheckMark state={done ? "done" : "empty"} />
                        <View style={{ flex: 1 }}>
                          <Txt tone={done ? "muted" : "default"} style={{ textDecorationLine: done ? "line-through" : "none" }}>
                            {item.name}
                          </Txt>
                          <Txt variant="caption" tone="muted">
                            {item.quantity}
                          </Txt>
                        </View>
                        <PriceBadge eur={item.estPriceEur} known={item.priceSource === "known"} />
                      </Pressable>
                    );
                  })}
                </Card>
              ))}
              {plan.data.tips.length ? (
                <Card title="Conseils">
                  {plan.data.tips.map((tip, i) => (
                    <Txt key={i} variant="callout" tone="muted">
                      · {tip}
                    </Txt>
                  ))}
                </Card>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon="cart-outline"
              title="Pas encore de plan de courses"
              body="Demande un menu à Claude, puis colle le JSON dans Importer."
              action={{ label: "Importer un plan", onPress: () => router.push({ pathname: "/plus/importer", params: { type: "courses" } }) }}
              secondary={{ label: "Générer", onPress: () => setGenerateSheet(true) }}
            />
          )}
        </>
      )}

      <Sheet visible={!!draft} onClose={() => setDraft(null)} title="Paramètres de la semaine">
        {draft ? (
          <View style={{ gap: space.xs }}>
            <Stepper
              label="Jours"
              value={String(draft.days)}
              canDecrement={draft.days > 1}
              canIncrement={draft.days < 7}
              onDecrement={() => setDraft({ ...draft, days: draft.days - 1 })}
              onIncrement={() => setDraft({ ...draft, days: draft.days + 1 })}
            />
            <Stepper
              label="Personnes"
              value={String(draft.people)}
              canDecrement={draft.people > 1}
              canIncrement={draft.people < 6}
              onDecrement={() => setDraft({ ...draft, people: draft.people - 1 })}
              onIncrement={() => setDraft({ ...draft, people: draft.people + 1 })}
            />
            <Stepper
              label="Budget"
              value={`${draft.budget} €`}
              canDecrement={draft.budget > 10}
              canIncrement={draft.budget < 300}
              onDecrement={() => setDraft({ ...draft, budget: Math.max(10, draft.budget - 5) })}
              onIncrement={() => setDraft({ ...draft, budget: Math.min(300, draft.budget + 5) })}
            />
            <View style={{ gap: space.sm }}>
              <Txt variant="captionStrong" tone="muted">
                Magasin
              </Txt>
              <Chips
                fill
                options={[
                  { value: "lidl", label: "Lidl" },
                  { value: "auchan", label: "Auchan" },
                ]}
                value={draft.store}
                onChange={(store) => setDraft({ ...draft, store })}
              />
            </View>
            <Txt variant="caption" tone="muted" style={{ marginTop: space.sm }}>
              Le budget sert de plafond au prochain plan généré par Claude. La liste actuelle ne change pas.
            </Txt>
            <View style={{ flexDirection: "row", gap: space.md, marginTop: space.md }}>
              <Button label="Annuler" variant="outline" style={{ flex: 1 }} onPress={() => setDraft(null)} />
              <Button
                label="Enregistrer"
                style={{ flex: 1 }}
                onPress={async () => {
                  await saveParams(draft);
                  haptics.success();
                  setDraft(null);
                }}
              />
            </View>
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={generateSheet} onClose={() => setGenerateSheet(false)} title="Nouveau plan" subtitle="Généré par Claude, il remplace la liste en cours">
        {params ? (
          <View style={{ gap: space.md }}>
            <ListRow
              icon="options-outline"
              title={`${paramsLine} · ${STORE_LABEL[params.store]}`}
              subtitle={`Budget ${euros(params.budget)} · modifier`}
              onPress={() => {
                setGenerateSheet(false);
                setDraft(params);
              }}
            />
            <Field label="Préférences (facultatif)" value={prefs} onChangeText={setPrefs} placeholder="ex. pas de poisson, 20 min max" />
            <View style={{ flexDirection: "row", gap: space.md }}>
              <Button label="Annuler" variant="outline" style={{ flex: 1 }} onPress={() => setGenerateSheet(false)} />
              <Button label="Générer" icon="sparkles-outline" style={{ flex: 1 }} loading={generating} onPress={generate} />
            </View>
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={!!meal} onClose={() => setMeal(null)} title={meal?.title ?? ""} subtitle={meal ? `${meal.prepMinutes} min · ${meal.slot === "diner" ? "dîner" : "déjeuner"}` : undefined}>
        {meal ? (
          <View style={{ gap: space.sm }}>
            {meal.steps.map((step, i) => (
              <View key={i} style={{ flexDirection: "row", gap: space.md }}>
                <Txt variant="label" tone="accent" style={{ width: 20 }}>
                  {i + 1}.
                </Txt>
                <Txt variant="callout" style={{ flex: 1 }}>
                  {step}
                </Txt>
              </View>
            ))}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function TotalCard({ plan, budget }: { plan: GroceryPlan; budget: number }) {
  const known = plan.items.filter((i) => i.priceSource === "known").length;
  const estimated = plan.items.length - known;
  const left = budget - plan.totalEstEur;
  return (
    <Card index={1} style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Txt variant="callout">Total estimé</Txt>
        <Txt variant="label" style={{ fontVariant: ["tabular-nums"] }}>
          ≈ {euros(plan.totalEstEur)} / {euros(budget)}
        </Txt>
      </View>
      <ProgressBar value={plan.totalEstEur / budget} label="Total estimé sur le budget" />
      <Txt variant="caption" tone={left < 0 ? "warning" : "muted"}>
        {known} prix connu{known > 1 ? "s" : ""} · {estimated} estimé{estimated > 1 ? "s" : ""} ·{" "}
        {left >= 0 ? `reste ≈ ${euros(left)}` : `dépasse de ≈ ${euros(-left)}`}
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
        <PriceBadge eur={1.15} known />
        <Txt variant="caption" tone="muted">
          prix relevé
        </Txt>
        <PriceBadge eur={2.4} known={false} />
        <Txt variant="caption" tone="muted">
          estimation
        </Txt>
      </View>
    </Card>
  );
}

function PriceBadge({ eur, known }: { eur: number; known: boolean }) {
  return known ? (
    <Badge label={`${euros(eur)} connu`} />
  ) : (
    <Badge variant="dashed" label={`≈ ${euros(eur)} estimé`} />
  );
}

function MealCard({ meal, day, onPress }: { meal: Meal; day: string; onPress: () => void }) {
  const t = useTheme();
  const a = useAccent();
  const isToday = day === today();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${dayLabel(day, { weekday: "long", day: "numeric" })} : ${meal.title}, ${meal.prepMinutes} minutes. Voir la recette`}
      onPress={onPress}
      style={{
        width: 148,
        minHeight: 112,
        padding: space.md,
        gap: 4,
        borderRadius: radius.lg - 4,
        backgroundColor: t.surface,
        borderWidth: isToday ? 1.5 : 0,
        borderColor: a.accent,
        boxShadow: t.dark ? undefined : t.cardShadow,
      }}
    >
      <Txt variant="overline" tone={isToday ? "accent" : "muted"} style={{ letterSpacing: 0.6 }}>
        {dayLabel(day, { weekday: "short", day: "numeric" })}
      </Txt>
      <Txt variant="label" numberOfLines={3} style={{ flex: 1 }}>
        {meal.title}
      </Txt>
      <Txt variant="caption" tone="muted">
        {meal.prepMinutes} min
      </Txt>
    </PressableScale>
  );
}
