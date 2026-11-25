import type { JSX } from "react";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  FlexWidget,
  IconWidget,
  ListWidget,
  requestWidgetUpdate,
  TextWidget,
  type HexColor,
  type WidgetInfo,
  type WidgetTaskHandlerProps,
} from "react-native-android-widget";
import { GroceryPlan, WorkoutSession, type Aisle } from "@ld/contracts";
import { palettes, type Domain } from "@/components/ui/theme";
import { runner, type Run } from "@/components/WorkoutRunner";
import { database } from "@/db/standalone";
import { AISLE_LABEL, AISLE_ORDER } from "@/lib/aisles";
import { diffDays, today } from "@/lib/dates";
import { waterGauge } from "@/lib/hydration";
import { loadNights } from "@/lib/nights";
import { addWater, pickNight, toggleDose, toggleGroceryItem, undoLastWater } from "@/lib/quickActions";
import { intSetting, readSettings } from "@/lib/settings";
import { isBucket, nightsSummary, previousNights, SLEEP_BUCKETS, weekdayInitial, type Bucket } from "@/lib/sleep";
import { isScheduled } from "@/lib/stock";
import { loadTreatments } from "@/lib/treatments";
import { clock, secondsLeft } from "@/lib/workoutTimeline";
import type { WidgetName } from "./refresh";

/**
 * Home-screen widgets (react-native-android-widget): plain RemoteViews drawn
 * from the database, light and dark. Buttons write through lib/quickActions
 * (the same writes as Today) or drive the running session, then redraw.
 * Runs in the app's JS runtime when it is alive, headless otherwise.
 */

type Palette = typeof palettes.light;
type Size = { w: number; h: number };

/** Glyphs of the Ionicons font copied into the build (app.json › react-native-android-widget › fonts). */
const GLYPH = {
  water: 63022,
  add: 61699,
  undo: 61759,
  medkit: 62540,
  moon: 62561,
  cart: 61955,
  pulse: 62711,
  check: 61981,
  checkCircle: 61982,
  circle: 62156,
  checkbox: 61978,
  square: 62867,
  play: 62662,
  pause: 62611,
  next: 62686,
  previous: 62680,
  stop: 62878,
  restaurant: 62774,
} as const;
type Glyph = keyof typeof GLYPH;

const hex = (color: string) => color as HexColor;
const fr = new Intl.NumberFormat("fr-FR");
const litres = (ml: number) => `${(ml / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} L`;
/** One home-screen cell is about 70 dp: under 110 dp the widget is one cell high (or wide). */
const oneCell = (dp: number) => dp < 110;

// ---------- building blocks ----------

function Icon({ glyph, size, color }: { glyph: Glyph; size: number; color: string }) {
  return <IconWidget font="Ionicons" icon={String.fromCharCode(GLYPH[glyph])} size={size} style={{ color: hex(color) }} />;
}

function Frame({ p, uri, label, children, pad = 14 }: { p: Palette; uri: string; label: string; children: unknown; pad?: number }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: `lifedashboard://${uri}` }}
      accessibilityLabel={label}
      style={{ width: "match_parent", height: "match_parent", flexDirection: "column", backgroundColor: hex(p.surface), borderRadius: 24, padding: pad }}
    >
      {children}
    </FlexWidget>
  );
}

function Header({ p, d, glyph, title, note }: { p: Palette; d: Domain; glyph: Glyph; title: string; note?: string }) {
  return (
    <FlexWidget style={{ width: "match_parent", flexDirection: "row", alignItems: "center", flexGap: 6, marginBottom: 6 }}>
      <Icon glyph={glyph} size={16} color={p.domain[d].accentText} />
      <TextWidget text={title} maxLines={1} style={{ fontSize: 13, fontWeight: "700", color: hex(p.text) }} />
      <FlexWidget style={{ flex: 1 }} />
      {note ? <TextWidget text={note} maxLines={1} style={{ fontSize: 12, color: hex(p.textMuted) }} /> : null}
    </FlexWidget>
  );
}

function Line({ p, text, size = 12, muted = true, bold = false, color }: { p: Palette; text: string; size?: number; muted?: boolean; bold?: boolean; color?: string }) {
  return (
    <TextWidget
      text={text}
      maxLines={1}
      truncate="END"
      style={{ fontSize: size, fontWeight: bold ? "700" : "normal", color: hex(color ?? (muted ? p.textMuted : p.text)) }}
    />
  );
}

/** A round (icon only) or pill (icon + label) button. No `action`: drawn disabled. */
function Button({
  p,
  d,
  glyph,
  label,
  text,
  action,
  data,
  filled = false,
  size = 40,
  grow = false,
}: {
  p: Palette;
  d: Domain;
  glyph: Glyph;
  label: string;
  text?: string;
  action?: string;
  data?: Record<string, unknown>;
  filled?: boolean;
  size?: number;
  grow?: boolean;
}) {
  const a = p.domain[d];
  const fg = !action ? p.textSubtle : filled ? a.onAccent : a.onAccentSoft;
  return (
    <FlexWidget
      clickAction={action}
      clickActionData={data}
      accessibilityLabel={label}
      style={{
        height: size,
        width: text || grow ? undefined : size,
        flex: grow ? 1 : undefined,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        flexGap: 6,
        paddingHorizontal: text ? 14 : 0,
        borderRadius: size / 2,
        backgroundColor: hex(!action ? p.surfaceAlt : filled ? a.accent : a.surfaceAccent),
      }}
    >
      <Icon glyph={glyph} size={Math.round(size * 0.5)} color={fg} />
      {text ? <TextWidget text={text} maxLines={1} style={{ fontSize: 13, fontWeight: "700", color: hex(fg) }} /> : null}
    </FlexWidget>
  );
}

function Message({ p, d, glyph, title, text, uri }: { p: Palette; d: Domain; glyph: Glyph; title: string; text: string; uri: string }) {
  return (
    <Frame p={p} uri={uri} label={`${title}. ${text}`}>
      <Header p={p} d={d} glyph={glyph} title={title} />
      <TextWidget text={text} maxLines={3} style={{ fontSize: 13, color: hex(p.textMuted) }} />
    </Frame>
  );
}

// ---------- Eau ----------

type WaterData = { ml: number; goal: number; glass: number };

async function loadWater(db: SQLiteDatabase): Promise<WaterData> {
  const settings = await readSettings(db);
  const row = await db.getFirstAsync<{ total: number | null }>("SELECT SUM(ml) AS total FROM hydration_log WHERE day = ?", today());
  return { ml: row?.total ?? 0, goal: intSetting(settings, "hydration_goal_ml", 2000), glass: intSetting(settings, "glass_ml", 250) };
}

function Water({ p, size, data }: { p: Palette; size: Size; data: WaterData }) {
  const { ml, goal, glass } = data;
  const a = p.domain.eau;
  const pct = Math.min(100, Math.floor((ml / goal) * 100));
  const { segments, filled, left } = waterGauge(ml, goal, glass);
  const note = left === 0 ? "Objectif atteint" : `Encore ${left} verre${left > 1 ? "s" : ""}`;
  const add = { glasses: 1 };

  if (oneCell(size.w)) {
    // 1×1 (or one column): the whole widget adds a glass.
    return (
      <FlexWidget
        clickAction="WATER_ADD"
        clickActionData={add}
        accessibilityLabel={`Ajouter ${glass} ml d'eau. ${litres(ml)} bus sur ${litres(goal)}`}
        style={{ width: "match_parent", height: "match_parent", flexDirection: "column", alignItems: "center", justifyContent: "center", flexGap: 2, backgroundColor: hex(a.surfaceAccent), borderRadius: 24 }}
      >
        <Icon glyph="water" size={22} color={a.accentText} />
        <Line p={p} text={litres(ml)} size={15} bold muted={false} />
        <Line p={p} text={`+${glass} ml`} size={11} color={a.accentText} />
      </FlexWidget>
    );
  }

  if (oneCell(size.h)) {
    // 2×1 and wider: figures on the left, undo and "+" on the right.
    return (
      <Frame p={p} uri="/" label={`Hydratation : ${fr.format(ml)} ml sur ${fr.format(goal)}`} pad={12}>
        <FlexWidget style={{ width: "match_parent", height: "match_parent", flexDirection: "row", alignItems: "center", flexGap: 8 }}>
          <FlexWidget style={{ flex: 1, flexDirection: "column" }}>
            <Line p={p} text={`${fr.format(ml)} ml`} size={18} bold muted={false} />
            <Line p={p} text={`${pct} % · ${note}`} size={11} />
          </FlexWidget>
          {ml > 0 && size.w >= 180 ? <Button p={p} d="eau" glyph="undo" label="Retirer le dernier verre" action="WATER_UNDO" size={36} /> : null}
          <Button p={p} d="eau" glyph="add" label={`Ajouter ${glass} ml`} action="WATER_ADD" data={add} filled size={44} />
        </FlexWidget>
      </Frame>
    );
  }

  return (
    <Frame p={p} uri="/" label={`Hydratation : ${fr.format(ml)} ml sur ${fr.format(goal)}`}>
      <Header p={p} d="eau" glyph="water" title="Hydratation" note={`objectif ${litres(goal)}`} />
      <FlexWidget style={{ width: "match_parent", flexDirection: "row", alignItems: "center" }}>
        <Line p={p} text={`${fr.format(ml)} ml`} size={26} bold muted={false} />
        <FlexWidget style={{ flex: 1 }} />
        <Line p={p} text={`${pct} %`} size={14} bold color={a.accentText} />
      </FlexWidget>
      <FlexWidget style={{ width: "match_parent", flexDirection: "row", flexGap: 3, marginVertical: 8 }}>
        {Array.from({ length: segments }, (_, i) => (
          <FlexWidget key={i} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: hex(i < filled ? a.accent : p.surfaceAlt) }} />
        ))}
      </FlexWidget>
      <Line p={p} text={note} size={12} />
      <FlexWidget style={{ flex: 1 }} />
      <FlexWidget style={{ width: "match_parent", flexDirection: "row", flexGap: 8 }}>
        <Button p={p} d="eau" glyph="add" label={`Ajouter ${glass} ml`} text={`${glass} ml`} action="WATER_ADD" data={add} filled grow />
        {size.w >= 250 ? (
          <Button p={p} d="eau" glyph="add" label={`Ajouter ${glass * 2} ml`} text={`${glass * 2} ml`} action="WATER_ADD" data={{ glasses: 2 }} grow />
        ) : null}
        {ml > 0 ? <Button p={p} d="eau" glyph="undo" label="Retirer le dernier verre" action="WATER_UNDO" /> : null}
      </FlexWidget>
    </Frame>
  );
}

// ---------- Traitements ----------

type DoseSlot = { id: number; name: string; slot: number; of: number; taken: boolean };

async function loadDoses(db: SQLiteDatabase): Promise<DoseSlot[]> {
  const day = today();
  return (await loadTreatments(db, day))
    .filter((s) => isScheduled(s.regimen, day))
    .flatMap((s) =>
      Array.from({ length: s.regimen!.dosesPerDay }, (_, i) => ({
        id: s.treatment.id,
        name: s.treatment.name,
        slot: i + 1,
        of: s.regimen!.dosesPerDay,
        taken: s.doses.some((d) => d.day === day && d.slot === i + 1),
      })),
    );
}

const doseName = (s: DoseSlot) => (s.of > 1 ? `${s.name} · prise ${s.slot}/${s.of}` : s.name);

function DoseRow({ p, s }: { p: Palette; s: DoseSlot }) {
  const a = p.domain.sante;
  return (
    <FlexWidget
      clickAction="DOSE"
      clickActionData={{ id: s.id, slot: s.slot }}
      accessibilityLabel={`${doseName(s)} : ${s.taken ? "pris, toucher pour annuler" : "à prendre, toucher pour cocher"}`}
      style={{ width: "match_parent", height: 40, flexDirection: "row", alignItems: "center", flexGap: 10 }}
    >
      <Icon glyph={s.taken ? "checkCircle" : "circle"} size={22} color={s.taken ? a.accent : p.borderStrong} />
      <TextWidget text={doseName(s)} maxLines={1} truncate="END" style={{ fontSize: 14, color: hex(s.taken ? p.textMuted : p.text) }} />
    </FlexWidget>
  );
}

function Treatments({ p, size, data }: { p: Palette; size: Size; data: DoseSlot[] }) {
  if (data.length === 0) return <Message p={p} d="sante" glyph="medkit" title="Traitements" text="Aucune prise prévue aujourd'hui." uri="/sante" />;
  const taken = data.filter((s) => s.taken).length;
  const note = `${taken}/${data.length}`;
  const next = data.find((s) => !s.taken);

  if (oneCell(size.h)) {
    return (
      <Frame p={p} uri="/sante" label={`Traitements : ${taken} prises sur ${data.length}`} pad={12}>
        <Header p={p} d="sante" glyph="medkit" title="Traitements" note={note} />
        {next ? (
          <Button p={p} d="sante" glyph="check" label={`Cocher ${doseName(next)}`} text={doseName(next)} action="DOSE" data={{ id: next.id, slot: next.slot }} filled size={34} />
        ) : (
          <Line p={p} text="Tout est pris aujourd'hui" size={13} color={p.domain.sante.accentText} />
        )}
      </Frame>
    );
  }

  return (
    <Frame p={p} uri="/sante" label={`Traitements : ${taken} prises sur ${data.length}`}>
      <Header p={p} d="sante" glyph="medkit" title="Traitements" note={note} />
      <FlexWidget style={{ width: "match_parent", flex: 1 }}>
        <ListWidget>
          {data.map((s) => (
            <DoseRow key={`${s.id}-${s.slot}`} p={p} s={s} />
          ))}
        </ListWidget>
      </FlexWidget>
    </Frame>
  );
}

// ---------- Sommeil ----------

type SleepData = { tonight: Bucket | null; week: (Bucket | null)[]; days: string[] };

async function loadSleep(db: SQLiteDatabase): Promise<SleepData> {
  const day = today();
  const nights = await loadNights(db);
  const week = previousNights(nights, day, 7);
  return { tonight: nights.find((n) => n.day === day)?.bucket ?? null, week: week.map((n) => n.bucket), days: week.map((n) => n.day) };
}

function Sleep({ p, size, data }: { p: Palette; size: Size; data: SleepData }) {
  const a = p.domain.sommeil;
  const chips = (
    <FlexWidget style={{ width: "match_parent", flexDirection: "row", flexGap: 6 }}>
      {SLEEP_BUCKETS.map((label, i) => {
        const on = data.tonight === i;
        return (
          <FlexWidget
            key={label}
            clickAction="NIGHT"
            clickActionData={{ bucket: i }}
            accessibilityLabel={`Nuit dernière : ${label}${on ? ", choisi" : ""}`}
            style={{ flex: 1, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: hex(on ? a.accent : a.surfaceAccent) }}
          >
            <TextWidget text={label} maxLines={1} style={{ fontSize: 12, fontWeight: "700", color: hex(on ? a.onAccent : a.onAccentSoft) }} />
          </FlexWidget>
        );
      })}
    </FlexWidget>
  );
  const label = `Sommeil, nuit dernière : ${data.tonight === null ? "pas notée" : SLEEP_BUCKETS[data.tonight]}`;

  if (oneCell(size.h)) {
    return (
      <Frame p={p} uri="/sante" label={label} pad={12}>
        <Header p={p} d="sommeil" glyph="moon" title="Nuit dernière" />
        {chips}
      </Frame>
    );
  }

  return (
    <Frame p={p} uri="/sante" label={label}>
      <Header p={p} d="sommeil" glyph="moon" title="Sommeil" note="nuit dernière" />
      {chips}
      <FlexWidget style={{ width: "match_parent", flex: 1, flexDirection: "row", alignItems: "flex-end", flexGap: 6, marginTop: 10 }}>
        {data.week.map((b, i) => (
          <FlexWidget key={data.days[i]} style={{ flex: 1, flexDirection: "column", alignItems: "center", flexGap: 3 }}>
            <FlexWidget style={{ width: "match_parent", height: b === null ? 4 : 10 + b * 8, borderRadius: 4, backgroundColor: hex(b === null ? p.surfaceAlt : a.accent) }} />
            <Line p={p} text={weekdayInitial(data.days[i])} size={10} />
          </FlexWidget>
        ))}
      </FlexWidget>
      <TextWidget text={nightsSummary(data.week)} maxLines={1} truncate="END" style={{ fontSize: 11, color: hex(p.textMuted), marginTop: 4 }} />
    </Frame>
  );
}

// ---------- Courses ----------

type GroceryData = { items: { name: string; quantity: string; aisle: Aisle; checked: boolean }[]; dinner: string | null } | null;

async function loadGroceries(db: SQLiteDatabase): Promise<GroceryData> {
  const row = await db.getFirstAsync<{ id: number; plan_json: string; start_day: string | null; created_at: string }>(
    "SELECT id, plan_json, start_day, created_at FROM grocery_plans ORDER BY id DESC LIMIT 1",
  );
  const parsed = row ? GroceryPlan.safeParse(JSON.parse(row.plan_json)) : null;
  if (!row || !parsed?.success) return null;
  const checks = await db.getAllAsync<{ item_name: string }>("SELECT item_name FROM grocery_checks WHERE plan_id = ?", row.id);
  const checked = new Set(checks.map((c) => c.item_name));
  const start = row.start_day ?? today(new Date(`${row.created_at.replace(" ", "T")}Z`));
  const n = diffDays(start, today()) + 1;
  const meals = parsed.data.meals;
  const dinner = meals.find((m) => m.day === n && m.slot === "diner") ?? meals.find((m) => m.day === n);
  const items = [...parsed.data.items]
    .sort((x, y) => AISLE_ORDER.indexOf(x.aisle) - AISLE_ORDER.indexOf(y.aisle))
    .map((i) => ({ name: i.name, quantity: i.quantity, aisle: i.aisle, checked: checked.has(i.name) }));
  return { items, dinner: dinner?.title ?? null };
}

function Groceries({ p, size, data }: { p: Palette; size: Size; data: GroceryData }) {
  if (!data) return <Message p={p} d="courses" glyph="cart" title="Courses" text="Pas encore de liste : génère-la dans Courses." uri="/courses" />;
  const a = p.domain.courses;
  const left = data.items.filter((i) => !i.checked).length;
  const note = `${data.items.length - left}/${data.items.length}`;
  const dinner = data.dinner ? <Line p={p} text={`Ce soir : ${data.dinner}`} size={12} /> : null;

  if (oneCell(size.h) || oneCell(size.w)) {
    return (
      <Frame p={p} uri="/courses" label={`Courses : ${left} articles à prendre`} pad={12}>
        <Header p={p} d="courses" glyph="cart" title="Courses" note={note} />
        <Line p={p} text={left ? `${left} article${left > 1 ? "s" : ""} à prendre` : "Tout est pris"} size={13} muted={false} />
        {dinner}
      </Frame>
    );
  }

  return (
    <Frame p={p} uri="/courses" label={`Courses : ${left} articles à prendre`}>
      <Header p={p} d="courses" glyph="cart" title="Courses" note={note} />
      {dinner}
      <FlexWidget style={{ width: "match_parent", flex: 1, marginTop: 4 }}>
        <ListWidget>
          {data.items.map((item, i) => (
            <FlexWidget key={item.name} style={{ width: "match_parent", flexDirection: "column" }}>
              {i === 0 || data.items[i - 1].aisle !== item.aisle ? (
                <TextWidget text={AISLE_LABEL[item.aisle].toUpperCase()} style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.6, color: hex(p.textMuted), marginTop: 8 }} />
              ) : null}
              <FlexWidget
                clickAction="GROCERY"
                clickActionData={{ name: item.name }}
                accessibilityLabel={`${item.name}, ${item.quantity} : ${item.checked ? "pris, toucher pour décocher" : "à prendre, toucher pour cocher"}`}
                style={{ width: "match_parent", height: 38, flexDirection: "row", alignItems: "center", flexGap: 10 }}
              >
                <Icon glyph={item.checked ? "checkbox" : "square"} size={20} color={item.checked ? a.accent : p.borderStrong} />
                <FlexWidget style={{ flex: 1 }}>
                  <TextWidget text={item.name} maxLines={1} truncate="END" style={{ fontSize: 14, color: hex(item.checked ? p.textSubtle : p.text) }} />
                </FlexWidget>
                <TextWidget text={item.quantity} maxLines={1} style={{ fontSize: 12, color: hex(p.textMuted) }} />
              </FlexWidget>
            </FlexWidget>
          ))}
        </ListWidget>
      </FlexWidget>
    </Frame>
  );
}

// ---------- Séance ----------

type WorkoutData = { run: Run | null; planned: { id: number; title: string; minutes: number; exercises: number; done: boolean } | null };

async function loadWorkout(db: SQLiteDatabase): Promise<WorkoutData> {
  const run = runner.get();
  if (run) return { run, planned: null };
  const row = await db.getFirstAsync<{ id: number; session_json: string; rpe: string | null }>(
    "SELECT id, session_json, rpe FROM workout_sessions WHERE day = ? ORDER BY id DESC LIMIT 1",
    today(),
  );
  const parsed = row ? WorkoutSession.safeParse(JSON.parse(row.session_json)) : null;
  if (!row || !parsed?.success) return { run: null, planned: null };
  const s = parsed.data;
  return { run: null, planned: { id: row.id, title: s.title, minutes: s.totalMinutes, exercises: s.exercises.length, done: row.rpe != null } };
}

const hhmmss = (ms: number) => new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function Workout({ p, size, data }: { p: Palette; size: Size; data: WorkoutData }) {
  const { run, planned } = data;
  const short = oneCell(size.h);

  if (!run) {
    if (!planned) return <Message p={p} d="sport" glyph="pulse" title="Séance" text="Pas de séance prévue aujourd'hui." uri="/sport" />;
    const info = planned.done ? "Faite aujourd'hui" : `${planned.minutes} min · ${planned.exercises} exercices`;
    return (
      <Frame p={p} uri="/sport" label={`Séance : ${planned.title}. ${info}`} pad={short ? 12 : 14}>
        <FlexWidget style={{ width: "match_parent", height: "match_parent", flexDirection: short ? "row" : "column", alignItems: short ? "center" : undefined, flexGap: 8 }}>
          <FlexWidget style={{ flex: short ? 1 : undefined, width: short ? undefined : "match_parent", flexDirection: "column" }}>
            {short ? null : <Header p={p} d="sport" glyph="pulse" title="Séance" note={planned.done ? "faite" : undefined} />}
            <Line p={p} text={planned.title} size={short ? 15 : 17} bold muted={false} />
            <Line p={p} text={info} size={12} />
          </FlexWidget>
          {short ? null : <FlexWidget style={{ flex: 1 }} />}
          {planned.done ? null : (
            <FlexWidget
              clickAction="OPEN_URI"
              clickActionData={{ uri: `lifedashboard:///seance?start=${planned.id}` }}
              accessibilityLabel={`Commencer la séance ${planned.title}`}
              style={{ height: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", flexGap: 6, paddingHorizontal: 16, borderRadius: 20, backgroundColor: hex(p.domain.sport.accent) }}
            >
              <Icon glyph="play" size={18} color={p.domain.sport.onAccent} />
              <TextWidget text="Commencer" style={{ fontSize: 13, fontWeight: "700", color: hex(p.domain.sport.onAccent) }} />
            </FlexWidget>
          )}
        </FlexWidget>
      </Frame>
    );
  }

  if (run.finished) {
    return (
      <Frame p={p} uri="/seance/ressenti" label="Séance terminée : note ton ressenti" pad={short ? 12 : 14}>
        {short ? null : <Header p={p} d="sport" glyph="pulse" title="Séance" note="terminée" />}
        <Line p={p} text="Séance terminée" size={16} bold muted={false} />
        <Line p={p} text={`${run.session.title} · touche pour noter ton ressenti`} size={12} />
      </Frame>
    );
  }

  const step = run.steps[run.index];
  const exercises = run.session.exercises;
  const ex = exercises[step.exercise];
  const following = exercises[run.steps[run.index + 1]?.exercise ?? -1];
  const rest = step.kind === "rest";
  const timed = step.seconds != null;
  const title = rest ? `Repos${following && following !== ex ? ` · ensuite ${following.name}` : ""}` : ex.name;
  const detail = `Série ${step.set}/${step.sets} · exercice ${step.exercise + 1}/${exercises.length}`;
  const status = !timed
    ? `× ${step.reps ?? ""} · puis « Série faite »`
    : run.paused
      ? `En pause · reste ${clock(secondsLeft(run, Date.now()))}`
      : `Jusqu'à ${hhmmss(run.endsAt ?? Date.now())}`;
  const a = p.domain.sport;
  const all = !short || size.w >= 240;
  const btn = short ? 36 : 44;

  const controls = (
    <FlexWidget style={{ flexDirection: "row", alignItems: "center", flexGap: short ? 6 : 10, width: short ? undefined : "match_parent", justifyContent: short ? undefined : "space-between" }}>
      {all ? <Button p={p} d="sport" glyph="previous" label="Étape précédente" action={run.index > 0 ? "RUN_PREV" : undefined} size={btn} /> : null}
      {timed ? (
        <Button p={p} d="sport" glyph={run.paused ? "play" : "pause"} label={run.paused ? "Reprendre" : "Pause"} action="RUN_PAUSE" filled size={btn + 8} />
      ) : (
        <Button p={p} d="sport" glyph="check" label="Série faite" action="RUN_NEXT" filled size={btn + 8} />
      )}
      <Button p={p} d="sport" glyph="next" label="Passer à l'étape suivante" action="RUN_NEXT" size={btn} />
      {all ? <Button p={p} d="sport" glyph="stop" label="Arrêter la séance" action="RUN_STOP" size={btn} /> : null}
    </FlexWidget>
  );

  return (
    <Frame p={p} uri="/seance" label={`Séance en cours : ${title}. ${detail}. ${status}`} pad={short ? 12 : 14}>
      <FlexWidget style={{ width: "match_parent", height: "match_parent", flexDirection: short ? "row" : "column", alignItems: short ? "center" : undefined, flexGap: 8 }}>
        <FlexWidget style={{ flex: short ? 1 : undefined, width: short ? undefined : "match_parent", flexDirection: "column" }}>
          {short ? null : <Header p={p} d="sport" glyph="pulse" title="Séance en cours" note={run.session.title} />}
          <Line p={p} text={title} size={short ? 15 : 18} bold muted={false} />
          <Line p={p} text={detail} size={12} />
          <Line p={p} text={status} size={12} bold color={a.accentText} />
        </FlexWidget>
        {short ? null : <FlexWidget style={{ flex: 1 }} />}
        {controls}
      </FlexWidget>
    </Frame>
  );
}

// ---------- rendering and taps ----------

async function render(name: WidgetName, info: WidgetInfo) {
  const db = await database();
  const size = { w: info.width, h: info.height };
  let view: (p: Palette) => JSX.Element;
  switch (name) {
    case "Water": {
      const data = await loadWater(db);
      view = (p) => <Water p={p} size={size} data={data} />;
      break;
    }
    case "Treatments": {
      const data = await loadDoses(db);
      view = (p) => <Treatments p={p} size={size} data={data} />;
      break;
    }
    case "Sleep": {
      const data = await loadSleep(db);
      view = (p) => <Sleep p={p} size={size} data={data} />;
      break;
    }
    case "Groceries": {
      const data = await loadGroceries(db);
      view = (p) => <Groceries p={p} size={size} data={data} />;
      break;
    }
    case "Workout": {
      const data = await loadWorkout(db);
      view = (p) => <Workout p={p} size={size} data={data} />;
      break;
    }
  }
  return { light: view(palettes.light), dark: view(palettes.dark) };
}

/** Redraws every placed instance of these widgets. */
export async function updateWidgets(names: WidgetName[]): Promise<void> {
  await Promise.all(names.map((name) => requestWidgetUpdate({ widgetName: name, renderWidget: (info) => render(name, info) })));
}

/** Writes a widget tap, returns the widgets whose content changed. */
async function onClick(action: string, data: Record<string, unknown>): Promise<WidgetName[]> {
  switch (action) {
    case "WATER_ADD":
      await addWater(await database(), Number(data.glasses) === 2 ? 2 : 1);
      return ["Water"];
    case "WATER_UNDO":
      await undoLastWater(await database());
      return ["Water"];
    case "DOSE":
      await toggleDose(await database(), Number(data.id), Number(data.slot));
      return ["Treatments"];
    case "NIGHT": {
      const bucket = Number(data.bucket);
      if (isBucket(bucket)) await pickNight(await database(), bucket);
      return ["Sleep"];
    }
    case "GROCERY":
      await toggleGroceryItem(await database(), String(data.name));
      return ["Groceries"];
    // The session store redraws the Workout widget itself.
    case "RUN_PREV":
      runner.previous();
      return [];
    case "RUN_PAUSE":
      runner.togglePause();
      return [];
    case "RUN_NEXT":
      runner.next();
      return [];
    case "RUN_STOP":
      runner.stop();
      return [];
  }
  return [];
}

export async function widgetTaskHandler({ widgetInfo, widgetAction, clickAction, clickActionData, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === "WIDGET_DELETED") return;
  const name = widgetInfo.widgetName as WidgetName;
  if (widgetAction === "WIDGET_CLICK" && clickAction) {
    const changed = await onClick(clickAction, clickActionData ?? {});
    // Every placed instance follows, not only the one tapped.
    if (changed.length) await updateWidgets(changed);
  }
  renderWidget(await render(name, widgetInfo));
}
