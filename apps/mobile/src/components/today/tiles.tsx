import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { router } from "expo-router";
import type { GroceryPlan, WorkoutSession } from "@ld/contracts";
import {
  Button,
  CheckMark,
  Chip,
  DayBars,
  Icon,
  ListRow,
  LocalBadge,
  ProgressBar,
  SegmentGauge,
  space,
  Tile,
  Txt,
  useAccent,
  useTheme,
  layoutTransition,
} from "@/components/ui";
import type { LayoutEntry } from "@/lib/dashboard";
import type { Run } from "@/components/WorkoutRunner";
import { diffDays, shortFrDate } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
import { waterGauge } from "@/lib/hydration";
import { dayProgress } from "@/lib/adherence";
import { formatCents } from "@/lib/money";
import { fundingOrder } from "@/lib/savings";
import { previousNights, nightsSummary, SLEEP_BUCKETS, weekdayInitial, type Bucket, type Night } from "@/lib/sleep";
import { isScheduled, regimenOn } from "@/lib/stock";
import type { MoneyAlert } from "@/lib/subscriptions";
import { dueAlerts, formatQty, stockLine, stockShort, type DoseRow, type TreatmentState } from "@/lib/treatments";
import type { HairState } from "@/lib/hairChecks";
import type { WishlistState } from "@/lib/wishlist";
import { groupBlocks, minutesLeft } from "@/lib/workoutTimeline";
import { ZONES } from "@/lib/hairPhotos";

const fr = new Intl.NumberFormat("fr-FR");
const litres = (ml: number) => `${(ml / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} L`;
const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

type Size = LayoutEntry["size"];

export function HydrationTile({
  size,
  index,
  ml,
  goal,
  glass,
  hint,
  onAdd,
}: {
  size: Size;
  index: number;
  ml: number;
  goal: number;
  glass: number;
  hint: string | null;
  onAdd: (glasses: number) => void;
}) {
  const { segments, filled, left } = waterGauge(ml, goal, glass);
  const note = left === 0 ? "Objectif du jour atteint" : `Encore ${left} verre${left > 1 ? "s" : ""}${hint ? ` · ${hint}` : ""}`;
  return (
    <Tile domain="eau" icon="water-outline" title="Hydratation" note={`objectif ${litres(goal)}`} index={index}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Txt variant={size === "large" ? "number" : "title"} numberOfLines={1} accessibilityLabel={`${ml} millilitres bus aujourd'hui`}>
          {fr.format(ml)} ml
        </Txt>
        <Txt variant="bodyStrong" tone="accent" style={{ fontVariant: ["tabular-nums"] }}>
          {Math.min(100, Math.floor((ml / goal) * 100))} %
        </Txt>
      </View>
      <SegmentGauge count={segments} filled={filled} label="Verres bus sur l'objectif" />
      <Txt variant="caption" tone="muted" numberOfLines={1}>
        {note}
      </Txt>
      <View style={{ flexDirection: size === "large" ? "row" : "column", gap: space.sm, marginTop: space.xs }}>
        <Button label={`+${glass} ml`} icon="add" onPress={() => onAdd(1)} style={{ flex: 1, paddingHorizontal: space.md }} />
        {size === "large" ? (
          <Button label={`+${glass * 2} ml`} icon="add" variant="soft" onPress={() => onAdd(2)} style={{ flex: 1, paddingHorizontal: space.md }} />
        ) : null}
      </View>
    </Tile>
  );
}

export type DoseTap = { state: TreatmentState; day: string; slot: number; dose: DoseRow | undefined };

export function TreatmentsTile({
  index,
  states,
  day,
  yesterday,
  onToggle,
  onYesterday,
  onAsNeeded,
}: {
  index: number;
  states: TreatmentState[];
  day: string;
  yesterday: string;
  onToggle: (tap: DoseTap) => void;
  onYesterday: (state: TreatmentState, slot: number, status: "taken" | "skipped") => void;
  onAsNeeded: (state: TreatmentState) => void;
}) {
  const t = useTheme();
  const alerts = new Set(dueAlerts(states, day).map((a) => a.key.replace(/^(stock|rx)-/, "")));
  const scheduled = states.filter((s) => isScheduled(s.regimen, day));
  const asNeeded = states.filter((s) => s.regimen?.frequency === "as_needed");
  const rows = scheduled.flatMap((s) =>
    Array.from({ length: s.regimen!.dosesPerDay }, (_, i) => i + 1).map((slot) => ({
      s,
      slot,
      dose: s.doses.find((d) => d.day === day && d.slot === slot),
    })),
  );
  const { expected, logged } = dayProgress(states, day);
  // Yesterday's open slots, with the regimen that was in force yesterday (none before a treatment starts).
  const late = states.flatMap((s) => {
    const then = regimenOn(s.regimens, yesterday);
    if (!then || !isScheduled(then, yesterday)) return [];
    const logged = new Set(s.doses.filter((d) => d.day === yesterday).map((d) => d.slot));
    return Array.from({ length: then.dosesPerDay }, (_, i) => i + 1)
      .filter((slot) => !logged.has(slot))
      .map((slot) => ({ s, slot }));
  });

  return (
    <Tile domain="sante" icon="medkit-outline" title="Traitements du jour" note={expected ? `${logged} / ${expected} fait` : undefined} index={index}>
      {rows.length === 0 && asNeeded.length === 0 ? (
        <Txt variant="callout" tone="muted">
          Aucune prise prévue aujourd'hui.
        </Txt>
      ) : null}
      <View>
        {rows.map(({ s, slot, dose }) => {
          const name = s.regimen!.dosesPerDay > 1 ? `${s.treatment.name} ${slot}/${s.regimen!.dosesPerDay}` : s.treatment.name;
          const stock = stockShort(s);
          const detail = !dose
            ? stockLine(s)
            : dose.status === "taken"
              ? `Fait à ${time(dose.takenAt)}${stock ? ` · ${stock}` : ""}`
              : "Noté manqué";
          return (
            <Animated.View key={`${s.treatment.id}-${slot}`} layout={layoutTransition}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: dose?.status === "taken" }}
                accessibilityLabel={`${name}, ${detail}`}
                accessibilityHint={dose ? "Touche pour décocher" : "Touche pour noter la prise"}
                onPress={() => onToggle({ state: s, day, slot, dose })}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.md,
                  minHeight: 56,
                  marginHorizontal: -space.sm,
                  paddingHorizontal: space.sm,
                  paddingVertical: 4,
                  borderRadius: 12,
                  backgroundColor: pressed ? t.track : "transparent",
                })}
              >
                <CheckMark state={dose ? (dose.status === "taken" ? "done" : "skipped") : "empty"} />
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong" numberOfLines={1} tone={dose ? "muted" : "default"}>
                    {name}
                  </Txt>
                  <Txt variant="caption" tone="muted" numberOfLines={1}>
                    {detail}
                  </Txt>
                </View>
                {alerts.has(String(s.treatment.id)) ? <Icon name="warning-outline" size={22} color={t.warning} /> : null}
              </Pressable>
            </Animated.View>
          );
        })}
        {asNeeded.map((s) => {
          const todays = s.doses.filter((d) => d.day === day && d.status === "taken").length;
          return (
            <ListRow
              key={s.treatment.id}
              title={s.treatment.name}
              subtitle={`À la demande · ${todays} aujourd'hui`}
              right={
                <Button
                  size="sm"
                  variant="soft"
                  icon="add"
                  label={formatQty(s.regimen!.doseQty, s.treatment.unit)}
                  onPress={() => onAsNeeded(s)}
                />
              }
            />
          );
        })}
      </View>
      {late.map(({ s, slot }) => (
        <View key={`late-${s.treatment.id}-${slot}`} style={{ backgroundColor: t.warningSoft, borderRadius: 16, padding: space.md, gap: space.sm }}>
          <Txt variant="callout" color={t.warning}>
            Hier non noté · {s.treatment.name}
          </Txt>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button size="sm" variant="outline" icon="checkmark" label="Pris hier" style={{ flex: 1 }} onPress={() => onYesterday(s, slot, "taken")} />
            <Button size="sm" variant="outline" icon="close" label="Manqué" style={{ flex: 1 }} onPress={() => onYesterday(s, slot, "skipped")} />
          </View>
        </View>
      ))}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48 }}>
        <LocalBadge />
        <Button variant="ghost" size="sm" label="Tout voir" onPress={() => router.push({ pathname: "/sante", params: { tab: "traitements" } })} />
      </View>
    </Tile>
  );
}

export function SleepTile({
  index,
  day,
  nights,
  tonight,
  onPick,
}: {
  index: number;
  day: string;
  nights: Night[];
  tonight: Bucket | null;
  onPick: (bucket: Bucket | null) => void;
}) {
  const previous = previousNights(nights, day);
  const bars = [
    ...previous.map((n) => ({ label: weekdayInitial(n.day), ratio: n.bucket === null ? 0 : (n.bucket + 1) / 4, faded: true })),
    { label: "Auj.", ratio: tonight === null ? null : (tonight + 1) / 4 },
  ];
  return (
    <Tile domain="sommeil" icon="moon-outline" title="Sommeil" note="nuit dernière" index={index}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {SLEEP_BUCKETS.map((label, i) => (
          <Chip
            key={label}
            label={label}
            active={tonight === i}
            style={{ flex: 1, paddingHorizontal: 4, minWidth: 0 }}
            onPress={() => {
              haptics.tap();
              onPick(tonight === i ? null : (i as Bucket));
            }}
          />
        ))}
      </View>
      <View style={{ marginTop: space.xs }}>
        <DayBars days={bars} label={`Nuits des 7 derniers jours. ${nightsSummary(previous.map((n) => n.bucket))}`} />
      </View>
      <Txt variant="caption" tone="muted">
        {nightsSummary(previous.map((n) => n.bucket))}
      </Txt>
    </Tile>
  );
}

export function WorkoutTile({
  size,
  index,
  session,
  rpe,
  yesterday,
  run,
  remaining,
  onStart,
}: {
  size: Size;
  index: number;
  session: { id: number; data: WorkoutSession };
  rpe: string | null;
  yesterday: string | null;
  run: Run | null;
  remaining: number;
  onStart: () => void;
}) {
  const a = useAccent("sport");
  const t = useTheme();
  const blocks = groupBlocks(session.data.exercises);
  const live = run && run.sessionId === session.id && !run.finished ? run : null;
  const step = live ? live.steps[live.index] : null;
  const doneExercises = live ? (step?.exercise ?? 0) : 0;
  const note = live ? "en cours" : rpe ? "faite" : `${session.data.totalMinutes} min`;
  return (
    <Tile domain="sport" icon="pulse-outline" title="Séance" note={note} index={index} style={size === "half" ? { flex: 1 } : undefined}>
      <Txt variant="label" numberOfLines={2} style={{ minHeight: 40 }}>
        {live && step ? session.data.exercises[step.exercise].name : session.data.title}
      </Txt>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", gap: 3 }}>
        {blocks.map((b) => {
          const firstIndex = b.exercises[0].index;
          const lastIndex = b.exercises[b.exercises.length - 1].index;
          const ratio = !live ? 0 : doneExercises > lastIndex ? 1 : doneExercises < firstIndex ? 0 : (doneExercises - firstIndex) / b.exercises.length;
          return (
            <View key={b.block} style={{ flex: b.minutes, height: 6, borderRadius: 3, backgroundColor: t.track, overflow: "hidden" }}>
              <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: a.accent, opacity: 0.3 }} />
              <View style={{ height: "100%", width: `${Math.round(ratio * 100)}%`, backgroundColor: a.accent }} />
            </View>
          );
        })}
      </View>
      {live && step ? (
        <>
          <Txt variant="caption" tone="muted">
            Exercice {step.exercise + 1} / {session.data.exercises.length} · série {step.set} sur {step.sets}
          </Txt>
          <Txt variant="caption" tone="muted">
            Reste environ {minutesLeft(live.steps, live.index, remaining)} min
          </Txt>
        </>
      ) : (
        <>
          <Txt variant="caption" tone="muted">
            {blocks.length} bloc{blocks.length > 1 ? "s" : ""} · {session.data.exercises.length} exercices
          </Txt>
          {rpe ? (
            <Txt variant="caption" tone="accent">
              Ressenti noté
            </Txt>
          ) : yesterday ? (
            <Txt variant="caption" tone="muted" numberOfLines={2}>
              Hier : {yesterday}
            </Txt>
          ) : null}
        </>
      )}
      <View style={{ flex: 1 }} />
      {rpe && !live ? (
        <Button label="Voir" variant="soft" onPress={() => router.push("/sport")} />
      ) : (
        <Button label={live ? "Reprendre" : "Commencer"} variant={live ? "soft" : "primary"} onPress={onStart} style={{ paddingHorizontal: space.md }} />
      )}
    </Tile>
  );
}

export type TodayPlan = { id: number; data: GroceryPlan; startDay: string; store: string; budgetEur: number; checked: number };

export function DinnerTile({ size, index, plan, day }: { size: Size; index: number; plan: TodayPlan; day: string }) {
  const n = diffDays(plan.startDay, day) + 1;
  const tonight = plan.data.meals.find((m) => m.day === n && m.slot === "diner") ?? plan.data.meals.find((m) => m.day === n);
  const items = plan.data.items.length;
  const store = plan.store === "auchan" ? "Auchan" : "Lidl";
  return (
    <Tile
      domain="courses"
      icon="cart-outline"
      title={tonight ? "Ce soir" : "Courses"}
      note={tonight ? `${tonight.prepMinutes} min` : undefined}
      index={index}
      style={size === "half" ? { flex: 1 } : undefined}
    >
      <Txt variant="label" numberOfLines={2} style={{ minHeight: 40 }}>
        {tonight ? tonight.title : "Pas de dîner prévu ce soir"}
      </Txt>
      <Txt variant="caption" tone="muted">
        Liste {store} · {plan.checked ? `${plan.checked} / ${items} cochés` : `${items} articles`}
      </Txt>
      <Txt variant="caption" tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
        ≈ {euros(plan.data.totalEstEur)} / {euros(plan.budgetEur)}
      </Txt>
      <ProgressBar value={plan.data.totalEstEur / plan.budgetEur} height={6} label="Total estimé sur le budget" />
      <View style={{ flex: 1 }} />
      <Button label="Voir la liste" variant="soft" onPress={() => router.push("/courses")} style={{ paddingHorizontal: space.md }} />
    </Tile>
  );
}

/** "42,70 €", "60 €". */
function euros(eur: number): string {
  const cents = Math.round(eur * 100);
  return formatCents(cents, cents % 100 === 0);
}

export function SavingsTile({ size, index, wishlist, day }: { size: Size; index: number; wishlist: WishlistState; day: string }) {
  const wanted = fundingOrder(wishlist.items.filter((i) => i.status === "wanted"));
  const goal = wanted[0];
  if (!goal) return null;
  const funding = wishlist.plan.get(goal.id);
  const funded = funding?.fundedCents ?? 0;
  const monthly = wishlist.settings.monthlyGoalCents;
  const when =
    funding?.monthsToGo === 0
      ? "Finançable maintenant"
      : funding?.monthsToGo != null
        ? `≈ ${monthLabel(day, funding.monthsToGo)}${monthly ? ` · ${formatCents(monthly, true)} / mois` : ""}`
        : "Fixe un objectif mensuel";
  return (
    <Tile domain="epargne" icon="gift-outline" title="Épargne" index={index} style={size === "half" ? { flex: 1 } : undefined}>
      <Pressable accessibilityRole="link" accessibilityLabel={`Épargne pour ${goal.name}. Ouvrir la wishlist`} onPress={() => router.push("/plus/wishlist")} style={{ gap: space.sm }}>
        <Txt variant="label" numberOfLines={2}>
          {goal.name}
        </Txt>
        <Txt variant="bodyStrong" style={{ fontVariant: ["tabular-nums"] }}>
          {formatCents(funded, true)} / {formatCents(goal.priceCents, true)}
        </Txt>
        <ProgressBar value={funded / goal.priceCents} height={6} label="Part déjà épargnée" />
        <Txt variant="caption" tone="muted">
          {when}
        </Txt>
      </Pressable>
    </Tile>
  );
}

function monthLabel(day: string, months: number): string {
  const [y, m] = day.split("-").map(Number);
  const d = new Date(y, m - 1 + months, 1);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export function HairTile({ size, index, hair, day }: { size: Size; index: number; hair: HairState; day: string }) {
  const days = diffDays(day, hair.due);
  const title = hair.open
    ? "Série à terminer"
    : hair.overdue
      ? `En retard de ${hair.overdue} j`
      : days <= 0
        ? "Aujourd'hui"
        : `Dans ${days} jour${days > 1 ? "s" : ""}`;
  const detail = hair.open ? `${hair.open.photos.length} / ${ZONES.length} zones` : `${shortFrDate(hair.due)} · ${ZONES.length} zones`;
  return (
    <Tile domain="sante" icon="camera-outline" title="Suivi cheveux" index={index} style={size === "half" ? { flex: 1 } : undefined}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Suivi cheveux, prochaine série : ${title}, ${detail}`}
        onPress={() => router.push(hair.open || hair.overdue !== null ? "/hair-check" : "/sante/cheveux")}
        style={{ gap: space.sm, flex: 1 }}
      >
        <Txt variant="caption" tone="muted">
          Prochaine série
        </Txt>
        <Txt variant="headline">{title}</Txt>
        <Txt variant="caption" tone="muted">
          {detail}
        </Txt>
        {hair.lastDay ? (
          <Txt variant="caption" tone="muted">
            Dernière le {shortFrDate(hair.lastDay)}
          </Txt>
        ) : null}
      </Pressable>
    </Tile>
  );
}

export function MoneyTile({ index, alerts }: { index: number; alerts: MoneyAlert[] }) {
  return (
    <Tile domain="epargne" icon="calendar-outline" title="À venir" index={index}>
      {alerts.map((a) => (
        <ListRow key={a.key} title={a.text} onPress={() => router.push(a.href)} />
      ))}
    </Tile>
  );
}
