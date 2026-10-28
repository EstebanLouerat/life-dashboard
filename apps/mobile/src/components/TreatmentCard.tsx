import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  Badge,
  Button,
  Card,
  Field,
  Icon,
  IconButton,
  layoutTransition,
  Notice,
  ProgressBar,
  radius,
  SectionTitle,
  space,
  Stat,
  StatGrid,
  Txt,
  useTheme,
  type Theme,
} from "@/components/ui";
import { treatmentIcon } from "@/components/TreatmentsToday";
import { adherence, history, type DayEntry, type DayStatus } from "@/lib/adherence";
import { addDays, atLocalTime, formatFrDate, isoWeekday, shortFrDate, today } from "@/lib/dates";
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

const WEEKS = 5;
const WEEKDAY_INITIALS = ["L", "M", "M", "J", "V", "S", "D"];

const STATUS_LABEL: Record<DayStatus, string> = {
  taken: "Pris",
  partial: "Partiel",
  skipped: "Noté manqué",
  missed: "Non noté",
  pending: "À faire",
  off: "Pas prévu",
  before: "Avant le suivi",
};

function cellColors(t: Theme, status: DayStatus | "future"): { bg: string; fg: string } {
  switch (status) {
    case "taken":
      return { bg: t.success, fg: t.onSuccess };
    case "partial":
    case "skipped":
      return { bg: t.warning, fg: t.onWarning };
    case "missed":
      return { bg: t.danger, fg: t.onDanger };
    case "pending":
      return { bg: t.primarySoft, fg: t.primaryText };
    case "off":
      return { bg: t.surfaceAlt, fg: t.textMuted };
    default:
      return { bg: "transparent", fg: t.textMuted };
  }
}

const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)} %`);

export function TreatmentCard({ state, onChanged, index }: { state: TreatmentState; onChanged: () => void; index: number }) {
  const db = useSQLiteContext();
  const t = useTheme();
  const { treatment: tr, regimen, forecast: f } = state;
  const day = today();
  const [stockInput, setStockInput] = useState("");
  const [stockError, setStockError] = useState<string | null>(null);
  const [editingStock, setEditingStock] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  // Calendar: WEEKS full weeks, Monday first, ending with the current week.
  const gridStart = addDays(day, -(isoWeekday(day) - 1) - 7 * (WEEKS - 1));
  const pastDays = history(state.regimens, state.doses, day, WEEKS * 7 - (7 - isoWeekday(day)));
  const cells: (DayEntry | { day: string; status: "future" })[] = [
    ...pastDays.filter((d) => d.day >= gridStart),
    ...Array.from({ length: 7 - isoWeekday(day) }, (_, i) => ({ day: addDays(day, i + 1), status: "future" as const })),
  ];
  const a7 = adherence(state.regimens, state.doses, day, 7);
  const a30 = adherence(state.regimens, state.doses, day, 30);
  const isLiquid = tr.unit === "ml";
  const packageWord = isLiquid ? "flacon" : "boîte";

  const saveStock = async () => {
    const qty = Number(stockInput.replace(",", "."));
    if (!stockInput.trim() || !Number.isFinite(qty) || qty < 0) {
      setStockError("Saisis une quantité positive.");
      return;
    }
    await addStock(db, tr.id, "set", qty);
    setStockInput("");
    setStockError(null);
    setEditingStock(false);
    onChanged();
  };

  const newPackage = () => {
    const size = tr.packageSize;
    if (!size) {
      Alert.alert(`Taille de ${packageWord} inconnue`, "Renseigne-la dans l'écran de modification.");
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
    f.rateSource === "real"
      ? f.rate === 0
        ? "Aucune prise pointée sur 14 jours : pas d'estimation."
        : "Estimé sur ta consommation réelle des 14 derniers jours."
      : f.rateSource === "planned"
        ? "Estimé sur la posologie prévue (moins de 14 jours de pointages)."
        : "Pas assez de données pour estimer.";

  const split = f.remaining !== null && tr.packageSize ? supplySplit(f.remaining, tr.packageSize) : null;
  const perPackage = regimen && tr.packageSize ? daysPerPackage(tr.packageSize, tr.wastePct, regimen) : null;
  const gauge = f.daysLeft !== null && perPackage ? f.daysLeft / Math.max(perPackage, f.daysLeft) : 0;
  const stockTone =
    f.remaining !== null && f.remaining <= 0
      ? t.danger
      : f.renewalAlertOn && f.renewalAlertOn <= day
        ? t.warning
        : t.module.care.solid;
  const rxTone =
    tr.prescriptionExpiresOn && tr.prescriptionExpiresOn < day
      ? "danger"
      : state.prescriptionAlertOn && state.prescriptionAlertOn <= day
        ? "warning"
        : "primary";
  const selectedEntry = selected ? pastDays.find((d) => d.day === selected) : undefined;

  return (
    <Card
      title={tr.name}
      subtitle={regimen ? describeRegimen(regimen, tr.unit) : "Pas de posologie"}
      icon={treatmentIcon(tr.unit)}
      color="care"
      index={index}
      right={
        <IconButton
          icon="create-outline"
          label={`Modifier ${tr.name}`}
          onPress={() => router.push({ pathname: "/modules/hair-care/[id]", params: { id: String(tr.id) } })}
        />
      }
    >
      {f.remaining === null ? (
        <Notice tone="info" title="Stock inconnu">
          Saisis la quantité qu'il te reste pour activer l'estimation.
        </Notice>
      ) : (
        <>
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, flexWrap: "wrap" }}>
              <Txt variant="number" color={stockTone}>
                {f.daysLeft === null ? "—" : `${Math.floor(f.daysLeft)} j`}
              </Txt>
              <Txt variant="callout" tone="muted">
                de stock{f.runOutOn ? ` · jusqu'au ${shortFrDate(f.runOutOn)}` : ""}
              </Txt>
            </View>
            <ProgressBar value={gauge} color={stockTone} height={10} label="Stock restant" />
            <Txt variant="caption" tone="muted">
              {rateNote}
            </Txt>
          </View>
          <StatGrid>
            <Stat
              label="Restant"
              value={formatQty(Math.max(0, f.remaining), tr.unit)}
              hint={split && split.reserve > 0 ? `dont ${split.reserve} ${packageWord}${split.reserve > 1 ? "s" : ""} en réserve` : undefined}
            />
            <Stat label={`Durée d'un${isLiquid ? "" : "e"} ${packageWord}`} value={perPackage === null ? "—" : `${Math.floor(perPackage)} j`} />
            <Stat label="Observance 7 j" value={a7.ratio === null ? `${a7.takenCount} prise(s)` : pct(a7.ratio)} />
            <Stat label="Observance 30 j" value={a30.ratio === null ? `${a30.takenCount} prise(s)` : pct(a30.ratio)} />
          </StatGrid>
        </>
      )}

      {tr.prescriptionExpiresOn ? (
        <Badge icon="document-text-outline" color={rxTone} label={`Ordonnance jusqu'au ${formatFrDate(tr.prescriptionExpiresOn)}`} />
      ) : null}

      <SectionTitle>5 dernières semaines</SectionTitle>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row" }}>
          {WEEKDAY_INITIALS.map((d, i) => (
            <Txt key={i} variant="caption" tone="muted" style={{ flex: 1, textAlign: "center" }}>
              {d}
            </Txt>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {cells.map((c) => {
            const colors = cellColors(t, c.status);
            const isSelected = c.day === selected;
            const disabled = c.status === "future" || c.status === "before";
            return (
              <View key={c.day} style={{ width: `${100 / 7}%`, padding: 3 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${formatFrDate(c.day)} : ${c.status === "future" ? "à venir" : STATUS_LABEL[c.status]}`}
                  accessibilityState={{ selected: isSelected, disabled }}
                  disabled={disabled}
                  onPress={() => setSelected(isSelected ? null : c.day)}
                  style={{
                    aspectRatio: 1,
                    minHeight: 40,
                    borderRadius: radius.sm,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.bg,
                    borderWidth: isSelected ? 2.5 : c.day === day ? 1.5 : 0,
                    borderColor: isSelected ? t.text : t.primaryText,
                    opacity: c.status === "before" ? 0.4 : 1,
                  }}
                >
                  <Txt variant="caption" color={colors.fg}>
                    {Number(c.day.slice(8))}
                  </Txt>
                </Pressable>
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md, marginTop: space.xs }}>
          {(["taken", "skipped", "missed", "off"] as const).map((s) => (
            <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: cellColors(t, s).bg }} />
              <Txt variant="caption" tone="muted">
                {STATUS_LABEL[s]}
              </Txt>
            </View>
          ))}
        </View>
      </View>

      {selectedEntry ? (
        <Animated.View key={selectedEntry.day} entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} layout={layoutTransition}>
          <DayPanel state={state} entry={selectedEntry} onChanged={onChanged} />
        </Animated.View>
      ) : null}

      {editingStock || f.remaining === null ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: space.sm }}>
          <Field
            label={`Stock actuel (${tr.unit})`}
            value={stockInput}
            onChangeText={(v) => {
              setStockInput(v);
              setStockError(null);
            }}
            keyboardType="decimal-pad"
            placeholder={tr.packageSize ? String(tr.packageSize) : undefined}
            error={stockError}
          />
          <Button label="Enregistrer le stock" onPress={saveStock} />
        </Animated.View>
      ) : null}

      <View style={{ flexDirection: "row", gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Button size="sm" variant="soft" icon="add-circle-outline" label={isLiquid ? "Nouveau flacon" : "Nouvelle boîte"} onPress={newPackage} />
        </View>
        {f.remaining !== null ? (
          <View style={{ flex: 1 }}>
            <Button
              size="sm"
              variant="secondary"
              icon={editingStock ? "close" : "calculator-outline"}
              label={editingStock ? "Fermer" : "Corriger"}
              onPress={() => setEditingStock(!editingStock)}
            />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

/** Check-offs of one day: catch up, mark missed, undo, add a note. */
function DayPanel({ state, entry, onChanged }: { state: TreatmentState; entry: DayEntry; onChanged: () => void }) {
  const db = useSQLiteContext();
  const t = useTheme();
  const own = state.doses.filter((d) => d.day === entry.day);
  const free = Array.from({ length: entry.expected }, (_, i) => i + 1).filter((slot) => !own.some((d) => d.slot === slot));
  const asNeeded = regimenOn(state.regimens, entry.day)?.frequency === "as_needed";
  const nextSlot = Math.max(0, ...own.map((d) => d.slot)) + 1;

  const log = async (slot: number, status: "taken" | "skipped") => {
    await logDose(db, state, entry.day, slot, status);
    onChanged();
  };

  return (
    <View style={{ gap: space.md, backgroundColor: t.surfaceAlt, borderRadius: radius.md, padding: space.md }}>
      <View style={{ gap: 2 }}>
        <Txt variant="bodyStrong" style={{ textTransform: "capitalize" }}>
          {atLocalTime(entry.day, 12).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </Txt>
        <Txt variant="caption" tone="muted">
          {STATUS_LABEL[entry.status]}
        </Txt>
      </View>
      {own.map((d) => (
        <DoseLine key={d.id} dose={d} onChanged={onChanged} />
      ))}
      {entry.status !== "before"
        ? free.map((slot) => (
            <View key={slot} style={{ flexDirection: "row", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Button size="sm" icon="checkmark" label="Pris" onPress={() => log(slot, "taken")} />
              </View>
              <View style={{ flex: 1 }}>
                <Button size="sm" variant="secondary" icon="close" label="Manqué" onPress={() => log(slot, "skipped")} />
              </View>
            </View>
          ))
        : null}
      {asNeeded ? <Button size="sm" variant="soft" icon="add" label="Ajouter une prise" onPress={() => log(nextSlot, "taken")} /> : null}
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
  const taken = dose.status === "taken";

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Icon name={taken ? "checkmark-circle" : "close-circle"} size={22} color={taken ? t.success : t.warning} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">{taken ? "Pris" : "Noté manqué"}</Txt>
          <Txt variant="caption" tone="muted">
            {late ? `Pointé le ${formatFrDate(loggedOn)} à ${loggedAt}` : `Pointé à ${loggedAt}`}
          </Txt>
        </View>
        <Button
          size="sm"
          variant="ghost"
          label="Annuler"
          onPress={async () => {
            await undoDose(db, dose.id);
            onChanged();
          }}
        />
      </View>
      <Field label="Note" value={note} onChangeText={setNote} placeholder="Facultatif" />
      {note !== (dose.note ?? "") ? (
        <Button
          size="sm"
          variant="soft"
          icon="save-outline"
          label="Enregistrer la note"
          onPress={async () => {
            await setDoseNote(db, dose.id, note);
            onChanged();
          }}
        />
      ) : null}
    </View>
  );
}
