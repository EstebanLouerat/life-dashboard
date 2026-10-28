import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Body, Button, Card, Field, Notice, Stat, StatRow, useTheme } from "@/components/ui";
import { adherence, history, type DayEntry, type DayStatus } from "@/lib/adherence";
import { atLocalTime, formatFrDate, shortFrDate, today } from "@/lib/dates";
import { daysPerPackage, regimenOn, supplySplit } from "@/lib/stock";
import {
  addStock,
  describeRegimen,
  formatQty,
  logDose,
  setDoseNote,
  undoDose,
  type DoseRow,
  type TreatmentState,
} from "@/lib/treatments";

const HISTORY_DAYS = 30;

const STATUS_LABEL: Record<DayStatus, string> = {
  taken: "Pris",
  partial: "Partiel",
  skipped: "Noté manqué",
  missed: "Non noté",
  pending: "À faire",
  off: "Pas prévu",
  before: "Avant le suivi",
};

const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)} %`);

export function TreatmentCard({ state, onChanged }: { state: TreatmentState; onChanged: () => void }) {
  const db = useSQLiteContext();
  const t = useTheme();
  const { treatment: tr, regimen, forecast: f } = state;
  const day = today();
  const [stockInput, setStockInput] = useState("");
  const [editingStock, setEditingStock] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const days = history(state.regimens, state.doses, day, HISTORY_DAYS);
  const a7 = adherence(state.regimens, state.doses, day, 7);
  const a30 = adherence(state.regimens, state.doses, day, 30);
  const isLiquid = tr.unit === "ml";
  const packageWord = isLiquid ? "flacon" : "boîte";

  const colorOf = (s: DayStatus) =>
    s === "taken" ? t.good : s === "partial" || s === "skipped" ? t.warn : s === "missed" ? t.danger : "transparent";

  const saveStock = async () => {
    const qty = Number(stockInput.replace(",", "."));
    if (!Number.isFinite(qty) || qty < 0) return Alert.alert("Quantité invalide");
    await addStock(db, tr.id, "set", qty);
    setStockInput("");
    setEditingStock(false);
    onChanged();
  };

  const newPackage = () => {
    const size = tr.packageSize;
    if (!size) {
      Alert.alert(`Taille de ${packageWord} inconnue`, "Renseigne-la dans « Modifier ».");
      return;
    }
    const add = async (kind: "add" | "set") => {
      await addStock(db, tr.id, kind, size);
      onChanged();
    };
    Alert.alert(`Nouveau ${packageWord} (${formatQty(size, tr.unit)})`, `L'ancien ${packageWord} est-il terminé ?`, [
      { text: "Annuler", style: "cancel" },
      { text: "Oui, remplacer", onPress: () => add("set") },
      { text: "Non, ajouter", onPress: () => add("add") },
    ]);
  };

  const rateNote =
    f.remaining === null
      ? null
      : f.rateSource === "real"
        ? f.rate === 0
          ? "Aucune prise pointée sur les 14 derniers jours : pas d'estimation."
          : "Estimation sur ta consommation réelle des 14 derniers jours."
        : f.rateSource === "planned"
          ? "Estimation sur la posologie prévue (moins de 14 jours de pointages)."
          : "Pas assez de données pour estimer.";

  const split = f.remaining !== null && tr.packageSize ? supplySplit(f.remaining, tr.packageSize) : null;
  const perPackage = regimen && tr.packageSize ? daysPerPackage(tr.packageSize, tr.wastePct, regimen) : null;
  const selectedEntry = selected ? days.find((d) => d.day === selected) : undefined;

  return (
    <Card title={tr.name}>
      <Body muted>{regimen ? describeRegimen(regimen, tr.unit) : "Pas de posologie"}</Body>

      {f.remaining === null ? (
        <Notice tone="info">Stock inconnu : saisis la quantité qu'il te reste pour activer l'estimation.</Notice>
      ) : (
        <>
          <StatRow>
            <Stat label="Restant" value={formatQty(Math.max(0, f.remaining), tr.unit)} />
            <Stat label="Jours restants" value={f.daysLeft === null ? "—" : `${Math.floor(f.daysLeft)} j`} />
            <Stat label="Épuisement estimé" value={f.runOutOn ? shortFrDate(f.runOutOn) : "—"} />
            <Stat label={`Durée d'un ${packageWord}`} value={perPackage === null ? "—" : `${Math.floor(perPackage)} j`} />
            <Stat
              label="Observance 7 j"
              value={a7.ratio === null ? `${a7.takenCount} prise(s)` : pct(a7.ratio)}
            />
            <Stat
              label="Observance 30 j"
              value={a30.ratio === null ? `${a30.takenCount} prise(s)` : pct(a30.ratio)}
            />
          </StatRow>
          {split && split.reserve > 0 ? (
            <Body muted>
              ≈ 1 {packageWord} entamé ({formatQty(split.opened, tr.unit)}) + {split.reserve} en réserve
            </Body>
          ) : null}
          {rateNote ? <Body muted>{rateNote}</Body> : null}
        </>
      )}

      {tr.prescriptionExpiresOn ? (
        <Body muted>Ordonnance : expire le {formatFrDate(tr.prescriptionExpiresOn)}</Body>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {days.map((d) => (
          <Pressable
            key={d.day}
            accessibilityLabel={`${formatFrDate(d.day)} : ${STATUS_LABEL[d.status]}`}
            onPress={() => setSelected(selected === d.day ? null : d.day)}
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              borderWidth: d.day === selected ? 2 : 1,
              borderColor: d.day === selected ? t.accent : t.border,
              backgroundColor: colorOf(d.status),
              opacity: d.status === "before" ? 0.3 : 1,
            }}
          />
        ))}
      </View>
      <Text style={{ color: t.muted, fontSize: 12 }}>
        30 derniers jours · vert pris · orange noté manqué · rouge non noté. Touche un jour pour le modifier.
      </Text>

      {selectedEntry ? (
        <DayPanel
          state={state}
          entry={selectedEntry}
          onChanged={onChanged}
        />
      ) : null}

      {editingStock || f.remaining === null ? (
        <View style={{ gap: 8 }}>
          <Field
            label={`Stock actuel (${tr.unit})`}
            value={stockInput}
            onChangeText={setStockInput}
            keyboardType="decimal-pad"
            placeholder={tr.packageSize ? String(tr.packageSize) : undefined}
          />
          <Button label="Enregistrer le stock" onPress={saveStock} />
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button compact label={isLiquid ? "Nouveau flacon" : "Nouvelle boîte"} onPress={newPackage} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            compact
            label={editingStock ? "Fermer" : "Corriger le stock"}
            variant="secondary"
            onPress={() => setEditingStock(!editingStock)}
          />
        </View>
      </View>
      <Button
        compact
        label="Modifier"
        variant="secondary"
        onPress={() => router.push({ pathname: "/modules/hair-care/[id]", params: { id: String(tr.id) } })}
      />
    </Card>
  );
}

/** Check-offs of one day: catch up, mark missed, undo, add a note. */
function DayPanel({ state, entry, onChanged }: { state: TreatmentState; entry: DayEntry; onChanged: () => void }) {
  const db = useSQLiteContext();
  const t = useTheme();
  const own = state.doses.filter((d) => d.day === entry.day);
  const free = Array.from({ length: entry.expected }, (_, i) => i + 1).filter((slot) => !own.some((d) => d.slot === slot));
  const futureDay = entry.day > today();
  const asNeeded = regimenOn(state.regimens, entry.day)?.frequency === "as_needed";
  const nextSlot = Math.max(0, ...own.map((d) => d.slot)) + 1;

  const log = async (slot: number, status: "taken" | "skipped") => {
    await logDose(db, state, entry.day, slot, status);
    onChanged();
  };

  return (
    <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 10 }}>
      <Text style={{ color: t.text, fontWeight: "700" }}>
        {atLocalTime(entry.day, 12).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} ·{" "}
        {STATUS_LABEL[entry.status]}
      </Text>
      {own.map((d) => (
        <DoseLine key={d.id} dose={d} onChanged={onChanged} />
      ))}
      {entry.status !== "before" && !futureDay
        ? free.map((slot) => (
            <View key={slot} style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button compact label="Pris" onPress={() => log(slot, "taken")} />
              </View>
              <View style={{ flex: 1 }}>
                <Button compact label="Manqué" variant="secondary" onPress={() => log(slot, "skipped")} />
              </View>
            </View>
          ))
        : null}
      {asNeeded && !futureDay ? <Button compact label="+ Prise" onPress={() => log(nextSlot, "taken")} /> : null}
    </View>
  );
}

function DoseLine({ dose, onChanged }: { dose: DoseRow; onChanged: () => void }) {
  const db = useSQLiteContext();
  const t = useTheme();
  const [note, setNote] = useState(dose.note ?? "");
  const loggedOn = today(new Date(dose.takenAt));
  const late = loggedOn > dose.day;
  const loggedAt = new Date(dose.takenAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, color: dose.status === "taken" ? t.good : t.warn }}>
          {dose.status === "taken" ? "✓ Pris" : "✗ Noté manqué"}
          <Text style={{ color: t.muted }}>
            {late ? ` · pointé le ${formatFrDate(loggedOn)} à ${loggedAt}` : ` · ${loggedAt}`}
          </Text>
        </Text>
        <Button
          compact
          label="Annuler"
          variant="secondary"
          onPress={async () => {
            await undoDose(db, dose.id);
            onChanged();
          }}
        />
      </View>
      <Field label="Note" value={note} onChangeText={setNote} placeholder="Facultatif" />
      {note !== (dose.note ?? "") ? (
        <Button
          compact
          label="Enregistrer la note"
          variant="secondary"
          onPress={async () => {
            await setDoseNote(db, dose.id, note);
            onChanged();
          }}
        />
      ) : null}
    </View>
  );
}
