import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { GroceryPlan, WorkoutSession, type GroceryRequest } from "@ld/contracts";
import { Button, Card, Field, ListRow, Notice, Screen, Segmented, space, Txt } from "@/components/ui";
import { addDays, atLocalTime, today } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
import { formatCents } from "@/lib/money";
import { intSetting, readSettings } from "@/lib/settings";
import { groupBlocks } from "@/lib/workoutTimeline";

type Kind = "courses" | "seance";

/** "42,70 €", "60 €". */
function euros(eur: number): string {
  const cents = Math.round(eur * 100);
  return formatCents(cents, cents % 100 === 0);
}

const day = (d: string, opts: Intl.DateTimeFormatOptions) => atLocalTime(d, 12).toLocaleDateString("fr-FR", opts);

type Parsed =
  | { ok: true; kind: "courses"; plan: GroceryPlan }
  | { ok: true; kind: "seance"; session: WorkoutSession }
  | { ok: false; error: string }
  | null;

/**
 * Validates pasted JSON against the same contract as the API (a grocery
 * plan or a workout session, as Claude writes them) and shows what it
 * contains before anything is replaced.
 */
function parse(kind: Kind, text: string): Parsed {
  if (!text.trim()) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Ce n'est pas du JSON : vérifie qu'il est copié en entier." };
  }
  const result = kind === "courses" ? GroceryPlan.safeParse(raw) : WorkoutSession.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? ` (champ ${issue.path.join(".")})` : "";
    return { ok: false, error: `Le JSON ne correspond pas à ${kind === "courses" ? "un plan de courses" : "une séance"}${where} : ${issue?.message ?? "format inattendu"}.` };
  }
  return kind === "courses"
    ? { ok: true, kind, plan: result.data as GroceryPlan }
    : { ok: true, kind, session: result.data as WorkoutSession };
}

export default function ImportScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ type?: string }>();
  const [kind, setKind] = useState<Kind>(params.type === "seance" ? "seance" : "courses");
  const [text, setText] = useState("");
  const [prefs, setPrefs] = useState<{ people: number; budget: number; store: "lidl" | "auchan" }>({ people: 2, budget: 60, store: "lidl" });
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (params.type === "seance" || params.type === "courses") setKind(params.type);
  }, [params.type]);

  useEffect(() => {
    readSettings(db).then((s) =>
      setPrefs({
        people: intSetting(s, "courses_people", 2),
        budget: intSetting(s, "courses_budget", 60),
        store: s.courses_store === "auchan" ? "auchan" : "lidl",
      }),
    );
  }, [db]);

  const parsed = useMemo(() => parse(kind, text), [kind, text]);

  const paste = async () => {
    const value = await Clipboard.getStringAsync();
    if (value) {
      haptics.tap();
      setText(value);
    }
  };

  const importNow = async () => {
    if (!parsed?.ok) return;
    setImporting(true);
    try {
      if (parsed.kind === "courses") {
        const previous = await db.getFirstAsync<{ id: number }>("SELECT id FROM grocery_plans ORDER BY id DESC LIMIT 1");
        const request: GroceryRequest = {
          days: Math.max(1, Math.min(7, Math.max(...parsed.plan.meals.map((m) => m.day), 1))),
          people: prefs.people,
          budgetEur: prefs.budget,
          store: prefs.store,
          mealsPerDay: ["diner"],
          pantry: [],
          knownPrices: [],
        };
        const res = await db.runAsync(
          "INSERT INTO grocery_plans (request_json, plan_json, start_day) VALUES (?, ?, ?)",
          JSON.stringify(request),
          JSON.stringify(parsed.plan),
          today(),
        );
        // Ticks carry over for items that are still on the list.
        if (previous) {
          const names = new Set(parsed.plan.items.map((i) => i.name));
          const checks = await db.getAllAsync<{ item_name: string }>("SELECT item_name FROM grocery_checks WHERE plan_id = ?", previous.id);
          for (const c of checks.filter((c) => names.has(c.item_name))) {
            await db.runAsync("INSERT OR IGNORE INTO grocery_checks (plan_id, item_name) VALUES (?, ?)", res.lastInsertRowId, c.item_name);
          }
        }
        haptics.success();
        setText("");
        router.navigate("/courses");
      } else {
        await db.runAsync("INSERT INTO workout_sessions (day, session_json) VALUES (?, ?)", today(), JSON.stringify(parsed.session));
        haptics.success();
        setText("");
        router.navigate("/sport");
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <Screen back title="Importer" subtitle="Plan de courses ou séance" domain="encre">
      <Segmented
        options={[
          { value: "courses", label: "Courses" },
          { value: "seance", label: "Séance" },
        ]}
        value={kind}
        onChange={setKind}
      />

      <Field
        label="JSON collé"
        value={text}
        onChangeText={setText}
        multiline
        mono
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={kind === "courses" ? '{ "meals": […], "items": […], "totalEstEur": 42.7, … }' : '{ "title": "…", "totalMinutes": 10, "exercises": […] }'}
        helper={`Généré par Claude (${kind === "courses" ? "menu de la semaine" : "séance"}), au même format que l'API.`}
        style={{ minHeight: 168, maxHeight: 240 }}
      />
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button variant="outline" icon="clipboard-outline" label="Coller" onPress={paste} />
        {text ? <Button variant="ghost" label="Effacer" onPress={() => setText("")} /> : null}
      </View>

      {parsed && !parsed.ok ? (
        <Notice tone="danger" title="JSON invalide" icon="alert-circle-outline">
          {parsed.error}
        </Notice>
      ) : null}

      {parsed?.ok ? (
        <>
          <Card title="Aperçu" right="JSON valide" style={{ gap: 0 }}>
            {parsed.kind === "courses" ? <CoursesPreview plan={parsed.plan} prefs={prefs} /> : <SessionPreview session={parsed.session} />}
          </Card>
          <Button
            icon="download-outline"
            label={parsed.kind === "courses" ? "Importer le plan" : "Importer la séance"}
            loading={importing}
            onPress={importNow}
          />
          <Txt variant="caption" tone="muted" style={{ paddingHorizontal: space.xs }}>
            {parsed.kind === "courses"
              ? "Remplace le plan de la semaine en cours. Les cases déjà cochées sont gardées si l'article existe encore."
              : "Devient la séance du jour. Une séance déjà faite aujourd'hui reste dans l'historique."}
          </Txt>
        </>
      ) : null}
    </Screen>
  );
}

function CoursesPreview({ plan, prefs }: { plan: GroceryPlan; prefs: { people: number; budget: number; store: "lidl" | "auchan" } }) {
  const days = Math.max(...plan.meals.map((m) => m.day), 1);
  const start = today();
  const known = plan.items.filter((i) => i.priceSource === "known").length;
  const aisles = new Set(plan.items.map((i) => i.aisle)).size;
  const left = prefs.budget - plan.totalEstEur;
  return (
    <>
      <ListRow
        icon="cart-outline"
        title={`${plan.meals.length} repas · ${prefs.people} personne${prefs.people > 1 ? "s" : ""}`}
        subtitle={`Semaine du ${day(start, { day: "numeric" })} au ${day(addDays(start, days - 1), { day: "numeric", month: "short" })} · ${prefs.store === "auchan" ? "Auchan" : "Lidl"}`}
      />
      <ListRow
        icon="checkmark"
        title={`${plan.items.length} articles sur ${aisles} rayon${aisles > 1 ? "s" : ""}`}
        subtitle={`${known} prix connus · ${plan.items.length - known} estimés`}
      />
      <ListRow
        icon="disc-outline"
        title={`Total ≈ ${euros(plan.totalEstEur)} / ${euros(prefs.budget)}`}
        subtitle={left >= 0 ? `Reste ≈ ${euros(left)}` : `Dépasse de ≈ ${euros(-left)}`}
        subtitleTone={left >= 0 ? "muted" : "warning"}
      />
    </>
  );
}

function SessionPreview({ session }: { session: WorkoutSession }) {
  const blocks = groupBlocks(session.exercises);
  return (
    <>
      <ListRow icon="pulse-outline" title={session.title} subtitle={`${session.totalMinutes} min · ${session.exercises.length} exercices`} />
      <ListRow icon="layers-outline" title={`${blocks.length} bloc${blocks.length > 1 ? "s" : ""}`} subtitle={blocks.map((b) => `${b.label} ≈ ${b.minutes} min`).join(" · ")} />
    </>
  );
}
