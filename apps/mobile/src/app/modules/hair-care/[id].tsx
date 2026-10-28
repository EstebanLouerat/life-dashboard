import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Body, Button, Card, Chips, Field, MultiChips, Screen } from "@/components/ui";
import { formatFrDate, parseFrDate } from "@/lib/dates";
import type { Frequency } from "@/lib/stock";
import {
  archiveTreatment,
  loadTreatments,
  refreshTreatments,
  saveTreatment,
  UNITS,
  WEEKDAY_OPTIONS,
} from "@/lib/treatments";

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Tous les jours" },
  { value: "weekdays", label: "Jours choisis" },
  { value: "as_needed", label: "À la demande" },
];

type Unit = (typeof UNITS)[number];

const num = (s: string) => Number(s.replace(",", ".").trim());

export default function TreatmentEditScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";

  const [name, setName] = useState("");
  const [unit, setUnit] = useState<Unit>("comprimé");
  const [doseQty, setDoseQty] = useState("1");
  const [dosesPerDay, setDosesPerDay] = useState("1");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [weekdays, setWeekdays] = useState<string[]>([]);
  const [reminderTime, setReminderTime] = useState("09:00");
  const [packageSize, setPackageSize] = useState("");
  const [wastePct, setWastePct] = useState("0");
  const [renewalLead, setRenewalLead] = useState("10");
  const [rxExpires, setRxExpires] = useState("");
  const [rxLead, setRxLead] = useState("10");

  useEffect(() => {
    if (isNew) return;
    loadTreatments(db).then((states) => {
      const s = states.find((x) => x.treatment.id === Number(id));
      if (!s) return;
      const tr = s.treatment;
      setName(tr.name);
      setUnit((UNITS as readonly string[]).includes(tr.unit) ? (tr.unit as Unit) : "comprimé");
      setReminderTime(tr.reminderTime ?? "");
      setPackageSize(tr.packageSize === null ? "" : String(tr.packageSize));
      setWastePct(String(Math.round(tr.wastePct * 100)));
      setRenewalLead(String(tr.renewalLeadDays));
      setRxExpires(tr.prescriptionExpiresOn ? formatFrDate(tr.prescriptionExpiresOn) : "");
      setRxLead(String(tr.prescriptionLeadDays));
      if (s.regimen) {
        setDoseQty(String(s.regimen.doseQty));
        setDosesPerDay(String(s.regimen.dosesPerDay));
        setFrequency(s.regimen.frequency);
        setWeekdays(s.regimen.weekdays.map(String));
      }
    });
  }, [db, id, isNew]);

  const save = async () => {
    const dose = num(doseQty);
    const perDay = num(dosesPerDay);
    const size = packageSize.trim() ? num(packageSize) : null;
    const waste = num(wastePct);
    const lead = num(renewalLead);
    const rxLeadDays = num(rxLead);
    const rxDay = rxExpires.trim() ? parseFrDate(rxExpires) : null;
    const time = reminderTime.trim();

    const errors = [
      !name.trim() && "le nom",
      !(dose > 0) && "la quantité par prise",
      !(Number.isInteger(perDay) && perDay >= 1) && "le nombre de prises par jour",
      frequency === "weekdays" && weekdays.length === 0 && "les jours",
      time && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(time) && "l'heure (HH:MM)",
      size !== null && !(size > 0) && "la taille de boîte",
      !(waste >= 0 && waste < 100) && "la marge de perte",
      !(Number.isInteger(lead) && lead >= 0) && "le délai d'alerte",
      rxExpires.trim() && !rxDay && "la date d'ordonnance (JJ/MM/AAAA)",
      !(Number.isInteger(rxLeadDays) && rxLeadDays >= 0) && "le délai d'alerte ordonnance",
    ].filter(Boolean);
    if (errors.length) {
      Alert.alert("À corriger", errors.join(", "));
      return;
    }

    await saveTreatment(
      db,
      {
        name,
        unit,
        packageSize: size,
        wastePct: waste / 100,
        reminderTime: time ? time.padStart(5, "0") : null,
        renewalLeadDays: lead,
        prescriptionExpiresOn: rxDay,
        prescriptionLeadDays: rxLeadDays,
        regimen: { doseQty: dose, dosesPerDay: perDay, frequency, weekdays: weekdays.map(Number) },
      },
      isNew ? undefined : Number(id),
    );
    await refreshTreatments(db, { doseReminders: true });
    router.back();
  };

  const archive = () =>
    Alert.alert("Archiver ce traitement ?", "Il disparaît des écrans et ses rappels sont annulés. L'historique est conservé.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Archiver",
        style: "destructive",
        onPress: async () => {
          await archiveTreatment(db, Number(id));
          router.back();
        },
      },
    ]);

  const packageWord = unit === "ml" ? "flacon" : "boîte";

  return (
    <Screen>
      <Stack.Screen options={{ title: isNew ? "Nouveau traitement" : name || "Traitement" }} />

      <Card title="Posologie">
        <Field label="Nom" value={name} onChangeText={setName} />
        <Chips options={UNITS.map((u) => ({ value: u, label: u }))} value={unit} onChange={setUnit} />
        <Field label={`Quantité par prise (${unit})`} value={doseQty} onChangeText={setDoseQty} keyboardType="decimal-pad" />
        <Field
          label={unit === "ml" ? "Applications par jour" : "Prises par jour"}
          value={dosesPerDay}
          onChangeText={setDosesPerDay}
          keyboardType="number-pad"
        />
        <Chips options={FREQUENCIES} value={frequency} onChange={setFrequency} />
        {frequency === "weekdays" ? <MultiChips options={WEEKDAY_OPTIONS} value={weekdays} onChange={setWeekdays} /> : null}
        {frequency !== "as_needed" ? (
          <Field
            label="Heure du rappel (HH:MM, vide = aucun)"
            value={reminderTime}
            onChangeText={setReminderTime}
            keyboardType="numbers-and-punctuation"
          />
        ) : null}
        {!isNew ? <Body muted>Un changement de posologie s'applique à partir d'aujourd'hui.</Body> : null}
      </Card>

      <Card title="Stock">
        <Field
          label={`Taille d'un${unit === "ml" ? "" : "e"} ${packageWord} (${unit})`}
          value={packageSize}
          onChangeText={setPackageSize}
          keyboardType="decimal-pad"
        />
        <Field label="Marge de perte (%)" value={wastePct} onChangeText={setWastePct} keyboardType="decimal-pad" />
        <Field
          label="Alerte avant épuisement (jours)"
          value={renewalLead}
          onChangeText={setRenewalLead}
          keyboardType="number-pad"
        />
      </Card>

      <Card title="Ordonnance">
        <Field
          label="Expiration (JJ/MM/AAAA, vide = aucune)"
          value={rxExpires}
          onChangeText={setRxExpires}
          keyboardType="numbers-and-punctuation"
          placeholder="31/12/2026"
        />
        <Field label="Alerte avant expiration (jours)" value={rxLead} onChangeText={setRxLead} keyboardType="number-pad" />
      </Card>

      <Button label="Enregistrer" onPress={save} />
      {!isNew ? <Button label="Archiver" variant="secondary" onPress={archive} /> : null}
    </Screen>
  );
}
