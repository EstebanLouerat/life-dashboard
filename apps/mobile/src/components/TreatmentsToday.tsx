import { View } from "react-native";
import Animated from "react-native-reanimated";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  Button,
  Card,
  CheckCircle,
  IconButton,
  IconTile,
  layoutTransition,
  Notice,
  radius,
  space,
  Txt,
  useTheme,
  type IconName,
} from "@/components/ui";
import { addDays, today } from "@/lib/dates";
import { isScheduled, regimenOn, type DoseStatus } from "@/lib/stock";
import { dueAlerts, formatQty, logDose, undoDose, type DoseRow, type TreatmentState } from "@/lib/treatments";

export function treatmentIcon(unit: string): IconName {
  if (unit === "ml") return "flask-outline";
  if (unit === "gélule") return "leaf-outline";
  return "medkit-outline";
}

/** Slots expected on `day` that have no check-off yet. */
function openSlots(s: TreatmentState, day: string): number[] {
  const r = regimenOn(s.regimens, day);
  if (!r || !isScheduled(r, day)) return [];
  const logged = new Set(s.doses.filter((d) => d.day === day).map((d) => d.slot));
  return Array.from({ length: r.dosesPerDay }, (_, i) => i + 1).filter((slot) => !logged.has(slot));
}

/** Expected and logged (taken or skipped) doses for `day`, across treatments. */
export function dayProgress(states: TreatmentState[], day: string) {
  let expected = 0;
  let logged = 0;
  for (const s of states) {
    if (!isScheduled(s.regimen, day)) continue;
    expected += s.regimen!.dosesPerDay;
    logged += s.doses.filter((d) => d.day === day && d.slot <= s.regimen!.dosesPerDay).length;
  }
  return { expected, logged };
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** Today card: one tap per scheduled dose, undo, yesterday catch-up and stock/prescription alerts. */
export function TreatmentsToday({
  states,
  onChanged,
  index,
}: {
  states: TreatmentState[];
  onChanged: () => void;
  index: number;
}) {
  const db = useSQLiteContext();
  const t = useTheme();
  const day = today();
  const yesterday = addDays(day, -1);

  const log = async (s: TreatmentState, d: string, slot: number, status: DoseStatus) => {
    await logDose(db, s, d, slot, status);
    onChanged();
  };

  const undo = async (dose: DoseRow) => {
    await undoDose(db, dose.id);
    onChanged();
  };

  const alerts = dueAlerts(states, day);
  const scheduled = states.filter((s) => isScheduled(s.regimen, day));
  const asNeeded = states.filter((s) => s.regimen?.frequency === "as_needed");
  const lateYesterday = states.flatMap((s) => openSlots(s, yesterday).map((slot) => ({ s, slot })));
  const { expected, logged } = dayProgress(states, day);

  return (
    <Card
      title="Traitements"
      subtitle={expected ? `${logged}/${expected} pointé${logged > 1 ? "s" : ""} aujourd'hui` : undefined}
      icon="medkit"
      color="care"
      index={index}
      right={<IconButton icon="stats-chart" variant="soft" label="Stock et historique" onPress={() => router.push("/modules/hair-care")} />}
    >
      {alerts.map((a) => (
        <Notice key={a.key} tone={a.tone === "warn" ? "warning" : "danger"}>
          {a.text}
        </Notice>
      ))}

      {scheduled.length === 0 && asNeeded.length === 0 ? <Txt tone="muted">Aucun traitement prévu aujourd'hui.</Txt> : null}

      {scheduled.flatMap((s) =>
        Array.from({ length: s.regimen!.dosesPerDay }, (_, i) => i + 1).map((slot) => {
          const dose = s.doses.find((d) => d.day === day && d.slot === slot);
          const name = s.regimen!.dosesPerDay > 1 ? `${s.treatment.name} ${slot}/${s.regimen!.dosesPerDay}` : s.treatment.name;
          return (
            <Animated.View
              key={`${s.treatment.id}-${slot}`}
              layout={layoutTransition}
              style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56 }}
            >
              <IconTile icon={treatmentIcon(s.treatment.unit)} color="care" />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{name}</Txt>
                {dose ? (
                  <Txt variant="caption" tone={dose.status === "taken" ? "success" : "warning"}>
                    {dose.status === "taken" ? `Pris à ${time(dose.takenAt)}` : "Noté manqué"}
                  </Txt>
                ) : (
                  <Txt variant="caption" tone="muted">
                    {formatQty(s.regimen!.doseQty, s.treatment.unit)}
                  </Txt>
                )}
              </View>
              <Button
                size="sm"
                variant="ghost"
                label={dose ? "Annuler" : "Manqué"}
                onPress={() => (dose ? undo(dose) : log(s, day, slot, "skipped"))}
              />
              <CheckCircle
                state={dose ? (dose.status === "taken" ? "done" : "skipped") : "empty"}
                label={dose ? `${name} : ${dose.status === "taken" ? "pris" : "manqué"}` : `Marquer ${name} comme pris`}
                onPress={() => log(s, day, slot, "taken")}
              />
            </Animated.View>
          );
        }),
      )}

      {asNeeded.map((s) => {
        const todays = s.doses.filter((d) => d.day === day && d.status === "taken");
        const last = todays[todays.length - 1];
        const nextSlot = Math.max(0, ...s.doses.filter((d) => d.day === day).map((d) => d.slot)) + 1;
        return (
          <View key={s.treatment.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56 }}>
            <IconTile icon={treatmentIcon(s.treatment.unit)} color="care" />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">{s.treatment.name}</Txt>
              <Txt variant="caption" tone="muted">
                À la demande · {todays.length} aujourd'hui
              </Txt>
            </View>
            {last ? <Button size="sm" variant="ghost" label="Annuler" onPress={() => undo(last)} /> : null}
            <IconButton icon="add" variant="soft" label={`Ajouter une prise de ${s.treatment.name}`} onPress={() => log(s, day, nextSlot, "taken")} />
          </View>
        );
      })}

      {lateYesterday.map(({ s, slot }) => (
        <Animated.View
          key={`y-${s.treatment.id}-${slot}`}
          layout={layoutTransition}
          style={{ backgroundColor: t.warningSoft, borderRadius: radius.md, padding: space.md, gap: space.sm }}
        >
          <Txt variant="callout">
            Hier non noté · <Txt variant="bodyStrong">{s.treatment.name}</Txt>
          </Txt>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button size="sm" variant="secondary" icon="checkmark" label="Pris hier" onPress={() => log(s, yesterday, slot, "taken")} />
            </View>
            <View style={{ flex: 1 }}>
              <Button size="sm" variant="secondary" icon="close" label="Manqué hier" onPress={() => log(s, yesterday, slot, "skipped")} />
            </View>
          </View>
        </Animated.View>
      ))}
    </Card>
  );
}
