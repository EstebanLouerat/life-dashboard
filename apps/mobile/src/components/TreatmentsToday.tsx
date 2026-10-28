import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Link, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Body, Button, Card, Notice, useTheme } from "@/components/ui";
import { addDays, today } from "@/lib/dates";
import { isScheduled, regimenOn, type DoseStatus } from "@/lib/stock";
import {
  dueAlerts,
  formatQty,
  logDose,
  refreshTreatments,
  undoDose,
  type DoseRow,
  type TreatmentState,
} from "@/lib/treatments";

/** Slots expected on `day` that have no check-off yet. */
function openSlots(s: TreatmentState, day: string): number[] {
  const r = regimenOn(s.regimens, day);
  if (!r || !isScheduled(r, day)) return [];
  const logged = new Set(s.doses.filter((d) => d.day === day).map((d) => d.slot));
  return Array.from({ length: r.dosesPerDay }, (_, i) => i + 1).filter((slot) => !logged.has(slot));
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** Today card: one tap per scheduled dose, undo, yesterday catch-up and stock/prescription alerts. */
export function TreatmentsToday() {
  const db = useSQLiteContext();
  const t = useTheme();
  const [states, setStates] = useState<TreatmentState[]>([]);
  const day = today();
  const yesterday = addDays(day, -1);

  const load = useCallback(async () => setStates(await refreshTreatments(db)), [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const log = async (s: TreatmentState, d: string, slot: number, status: DoseStatus) => {
    await logDose(db, s, d, slot, status);
    load();
  };

  const undo = async (dose: DoseRow) => {
    await undoDose(db, dose.id);
    load();
  };

  const alerts = dueAlerts(states, day);
  const scheduled = states.filter((s) => isScheduled(s.regimen, day));
  const asNeeded = states.filter((s) => s.regimen?.frequency === "as_needed");
  const lateYesterday = states.flatMap((s) => openSlots(s, yesterday).map((slot) => ({ s, slot })));

  return (
    <Card title="Traitements">
      {alerts.map((a) => (
        <Notice key={a.key} tone={a.tone}>
          {a.text}
        </Notice>
      ))}

      {scheduled.length === 0 && asNeeded.length === 0 ? <Body muted>Aucun traitement prévu aujourd'hui.</Body> : null}

      {scheduled.flatMap((s) =>
        Array.from({ length: s.regimen!.dosesPerDay }, (_, i) => i + 1).map((slot) => {
          const dose = s.doses.find((d) => d.day === day && d.slot === slot);
          const label = s.regimen!.dosesPerDay > 1 ? `${s.treatment.name} ${slot}/${s.regimen!.dosesPerDay}` : s.treatment.name;
          return (
            <View key={`${s.treatment.id}-${slot}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 15, fontWeight: "600" }}>{label}</Text>
                {dose ? (
                  <Text style={{ color: dose.status === "taken" ? t.good : t.warn, fontSize: 13 }}>
                    {dose.status === "taken" ? `✓ Pris à ${time(dose.takenAt)}` : "✗ Noté manqué"}
                  </Text>
                ) : (
                  <Text style={{ color: t.muted, fontSize: 13 }}>{formatQty(s.regimen!.doseQty, s.treatment.unit)}</Text>
                )}
              </View>
              {dose ? (
                <Button compact label="Annuler" variant="secondary" onPress={() => undo(dose)} />
              ) : (
                <>
                  <Button compact label="Pris" onPress={() => log(s, day, slot, "taken")} />
                  <Button compact label="Manqué" variant="secondary" onPress={() => log(s, day, slot, "skipped")} />
                </>
              )}
            </View>
          );
        }),
      )}

      {asNeeded.map((s) => {
        const todays = s.doses.filter((d) => d.day === day && d.status === "taken");
        const last = todays[todays.length - 1];
        const nextSlot = Math.max(0, ...s.doses.filter((d) => d.day === day).map((d) => d.slot)) + 1;
        return (
          <View key={s.treatment.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 15, fontWeight: "600" }}>{s.treatment.name}</Text>
              <Text style={{ color: t.muted, fontSize: 13 }}>
                À la demande · {todays.length} aujourd'hui
              </Text>
            </View>
            <Button compact label="+ Prise" onPress={() => log(s, day, nextSlot, "taken")} />
            {last ? <Button compact label="Annuler" variant="secondary" onPress={() => undo(last)} /> : null}
          </View>
        );
      })}

      {lateYesterday.map(({ s, slot }) => (
        <View key={`y-${s.treatment.id}-${slot}`} style={{ gap: 8 }}>
          <Body muted>Hier non noté : {s.treatment.name}</Body>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button compact label="Pris hier" variant="secondary" onPress={() => log(s, yesterday, slot, "taken")} />
            </View>
            <View style={{ flex: 1 }}>
              <Button compact label="Manqué hier" variant="secondary" onPress={() => log(s, yesterday, slot, "skipped")} />
            </View>
          </View>
        </View>
      ))}

      <Link href="/modules/hair-care" style={{ color: t.accent, fontSize: 14, fontWeight: "600" }}>
        Stock et historique ›
      </Link>
    </Card>
  );
}
