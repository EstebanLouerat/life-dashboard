import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Button, Card, Field, FormErrorSummary, MultiChips, Screen, Segmented, space, Txt, useFormErrors } from "@/components/ui";
import { formatFrDate, parseFrDate } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
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
  { value: "daily", label: "Chaque jour" },
  { value: "weekdays", label: "Certains jours" },
  { value: "as_needed", label: "À la demande" },
];

type Unit = (typeof UNITS)[number];
type Errors = Partial<Record<"name" | "dose" | "perDay" | "weekdays" | "time" | "size" | "waste" | "lead" | "rx" | "rxLead", string>>;

const num = (s: string) => Number(s.replace(",", ".").trim());
const isWholeDays = (n: number) => Number.isInteger(n) && n >= 0;

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
  const [saving, setSaving] = useState(false);

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

  const validate = (): Errors => {
    const dose = num(doseQty);
    const perDay = num(dosesPerDay);
    const size = packageSize.trim() ? num(packageSize) : null;
    const waste = num(wastePct);
    const lead = num(renewalLead);
    const rxLeadDays = num(rxLead);
    const rxDay = rxExpires.trim() ? parseFrDate(rxExpires) : null;
    const time = reminderTime.trim();

    const next: Errors = {};
    if (!name.trim()) next.name = "Donne un nom au traitement.";
    if (!(dose > 0)) next.dose = "Quantité supérieure à 0.";
    if (!(Number.isInteger(perDay) && perDay >= 1)) next.perDay = "Nombre entier, au moins 1.";
    if (frequency === "weekdays" && weekdays.length === 0) next.weekdays = "Choisis au moins un jour.";
    if (time && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) next.time = "Format HH:MM, par exemple 09:00.";
    if (size !== null && !(size > 0)) next.size = "Quantité supérieure à 0, ou vide.";
    if (!(waste >= 0 && waste < 100)) next.waste = "Entre 0 et 99 %.";
    if (!isWholeDays(lead)) next.lead = "Nombre de jours entier.";
    if (rxExpires.trim() && !rxDay) next.rx = "Format JJ/MM/AAAA, par exemple 31/12/2026.";
    if (!isWholeDays(rxLeadDays)) next.rxLead = "Nombre de jours entier.";
    return next;
  };
  const { errors, setErrors, edit, blur, submit } = useFormErrors(validate);

  const save = async () => {
    if (!submit()) {
      haptics.warning();
      return;
    }
    const dose = num(doseQty);
    const perDay = num(dosesPerDay);
    const size = packageSize.trim() ? num(packageSize) : null;
    const waste = num(wastePct);
    const lead = num(renewalLead);
    const rxLeadDays = num(rxLead);
    const rxDay = rxExpires.trim() ? parseFrDate(rxExpires) : null;
    const time = reminderTime.trim();

    setSaving(true);
    try {
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
      haptics.success();
      router.back();
    } finally {
      setSaving(false);
    }
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
    <Screen back title={isNew ? "Nouveau traitement" : name || "Traitement"} subtitle={isNew ? undefined : "Modifier le traitement"}>
      <Card title="Posologie" icon="medkit-outline" color="care" index={0}>
        <Field label="Nom" value={name} onChangeText={edit("name", setName)} error={errors.name} />
        <View style={{ gap: 6 }}>
          <Txt variant="caption" tone="muted">
            Unité
          </Txt>
          <Segmented options={UNITS.map((u) => ({ value: u, label: u }))} value={unit} onChange={setUnit} />
        </View>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field
              label={`Par prise (${unit})`}
              value={doseQty}
              onChangeText={edit("dose", setDoseQty)}
              onBlur={blur("dose", doseQty)}
              keyboardType="decimal-pad"
              error={errors.dose}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label={unit === "ml" ? "Applications / jour" : "Prises / jour"}
              value={dosesPerDay}
              onChangeText={edit("perDay", setDosesPerDay)}
              onBlur={blur("perDay", dosesPerDay)}
              keyboardType="number-pad"
              error={errors.perDay}
            />
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Txt variant="caption" tone="muted">
            Fréquence
          </Txt>
          <Segmented options={FREQUENCIES} value={frequency} onChange={setFrequency} />
        </View>
        {frequency === "weekdays" ? (
          <View style={{ gap: 6 }}>
            <MultiChips
              options={WEEKDAY_OPTIONS}
              value={weekdays}
              onChange={(v) => {
                setWeekdays(v);
                if (errors.weekdays) setErrors({ ...errors, weekdays: undefined });
              }}
            />
            {errors.weekdays ? (
              <Txt variant="caption" tone="danger">
                {errors.weekdays}
              </Txt>
            ) : null}
          </View>
        ) : null}
        {!isNew ? (
          <Txt variant="caption" tone="muted">
            Un changement de posologie s'applique à partir d'aujourd'hui ; les jours passés gardent l'ancienne.
          </Txt>
        ) : null}
      </Card>

      {frequency !== "as_needed" ? (
        <Card title="Rappel" icon="notifications-outline" color="primary" index={1}>
          <Field
            label="Heure du rappel"
            helper="Laisse vide pour ne pas être rappelé."
            value={reminderTime}
            onChangeText={edit("time", setReminderTime)}
            onBlur={blur("time", reminderTime)}
            keyboardType="numbers-and-punctuation"
            placeholder="09:00"
            error={errors.time}
          />
        </Card>
      ) : null}

      <Card title="Stock" icon="cube-outline" color="care" index={2}>
        <Field
          label={`Taille d'un${unit === "ml" ? "" : "e"} ${packageWord} (${unit})`}
          value={packageSize}
          onChangeText={edit("size", setPackageSize)}
          onBlur={blur("size", packageSize)}
          keyboardType="decimal-pad"
          error={errors.size}
        />
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field label="Marge de perte (%)" value={wastePct} onChangeText={edit("waste", setWastePct)} onBlur={blur("waste", wastePct)} keyboardType="decimal-pad" error={errors.waste} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Alerte (jours avant)" value={renewalLead} onChangeText={edit("lead", setRenewalLead)} onBlur={blur("lead", renewalLead)} keyboardType="number-pad" error={errors.lead} />
          </View>
        </View>
      </Card>

      <Card title="Ordonnance" icon="document-text-outline" color="primary" index={3}>
        <Field
          label="Expiration"
          helper="JJ/MM/AAAA, vide si pas d'ordonnance."
          value={rxExpires}
          onChangeText={edit("rx", setRxExpires)}
          onBlur={blur("rx", rxExpires)}
          keyboardType="numbers-and-punctuation"
          placeholder="31/12/2026"
          error={errors.rx}
        />
        <Field label="Alerte (jours avant)" value={rxLead} onChangeText={edit("rxLead", setRxLead)} onBlur={blur("rxLead", rxLead)} keyboardType="number-pad" error={errors.rxLead} />
      </Card>

      <FormErrorSummary errors={errors} />
      <Button label="Enregistrer" icon="checkmark" onPress={save} loading={saving} />
      {!isNew ? <Button label="Archiver" icon="archive-outline" variant="danger" onPress={archive} /> : null}
    </Screen>
  );
}
