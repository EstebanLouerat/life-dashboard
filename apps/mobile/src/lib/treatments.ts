import type { SQLiteDatabase } from "expo-sqlite";
import { atLocalTime, formatFrDate, shortFrDate, today } from "@/lib/dates";
import { loadReminderPrefs } from "@/lib/reminderSettings";
import {
  CHANNEL_TREATMENTS,
  cancelScheduled,
  scheduleAt,
  scheduleDaily,
  scheduleWeekly,
} from "@/lib/notifications";
import {
  leadDate,
  regimenOn,
  stockForecast,
  supplySplit,
  type Dose,
  type DoseStatus,
  type Forecast,
  type Frequency,
  type Regimen,
  type StockEvent,
} from "@/lib/stock";

export type Treatment = {
  id: number;
  name: string;
  unit: string; // comprimé | gélule | ml
  packageSize: number | null;
  wastePct: number;
  reminderTime: string | null; // HH:MM
  renewalLeadDays: number;
  prescriptionExpiresOn: string | null;
  prescriptionLeadDays: number;
};

export type DoseRow = Dose & { id: number; note: string | null };

export type TreatmentState = {
  treatment: Treatment;
  regimens: Regimen[];
  regimen: Regimen | null; // in force today
  doses: DoseRow[]; // active (not undone) only
  stockEvents: StockEvent[];
  forecast: Forecast;
  prescriptionAlertOn: string | null;
};

export type TreatmentInput = Omit<Treatment, "id"> & { regimen: Omit<Regimen, "effectiveFrom"> };

export const UNITS = ["comprimé", "gélule", "ml"] as const;

/** Hour of the day one-shot alerts (renewal, prescription) fire at. */
const ALERT_HOUR = 9;

type TreatmentRow = {
  id: number;
  name: string;
  unit: string;
  package_size: number | null;
  waste_pct: number;
  reminder_time: string | null;
  renewal_lead_days: number;
  prescription_expires_on: string | null;
  prescription_lead_days: number;
};

export async function loadTreatments(db: SQLiteDatabase, day = today()): Promise<TreatmentState[]> {
  const rows = await db.getAllAsync<TreatmentRow>(
    "SELECT * FROM treatments WHERE archived_at IS NULL ORDER BY sort_order, id",
  );
  const regimens = await db.getAllAsync<{
    treatment_id: number;
    effective_from: string;
    dose_qty: number;
    doses_per_day: number;
    frequency: Frequency;
    weekdays: string | null;
  }>("SELECT * FROM treatment_regimens ORDER BY effective_from");
  const doses = await db.getAllAsync<{
    id: number;
    treatment_id: number;
    day: string;
    slot: number;
    status: DoseStatus;
    qty: number;
    taken_at: string;
    note: string | null;
  }>("SELECT * FROM treatment_doses WHERE undone_at IS NULL ORDER BY day, slot");
  const events = await db.getAllAsync<{ treatment_id: number; kind: "add" | "set"; qty: number; at: string }>(
    "SELECT treatment_id, kind, qty, at FROM treatment_stock_events ORDER BY at",
  );

  return rows.map((row) => {
    const treatment: Treatment = {
      id: row.id,
      name: row.name,
      unit: row.unit,
      packageSize: row.package_size,
      wastePct: row.waste_pct,
      reminderTime: row.reminder_time,
      renewalLeadDays: row.renewal_lead_days,
      prescriptionExpiresOn: row.prescription_expires_on,
      prescriptionLeadDays: row.prescription_lead_days,
    };
    const own: Regimen[] = regimens
      .filter((r) => r.treatment_id === row.id)
      .map((r) => ({
        effectiveFrom: r.effective_from,
        doseQty: r.dose_qty,
        dosesPerDay: r.doses_per_day,
        frequency: r.frequency,
        weekdays: r.weekdays ? r.weekdays.split(",").map(Number) : [],
      }));
    const ownDoses: DoseRow[] = doses
      .filter((d) => d.treatment_id === row.id)
      .map((d) => ({ id: d.id, day: d.day, slot: d.slot, status: d.status, qty: d.qty, takenAt: d.taken_at, note: d.note }));
    const stockEvents = events.filter((e) => e.treatment_id === row.id).map(({ kind, qty, at }) => ({ kind, qty, at }));
    return {
      treatment,
      regimens: own,
      regimen: regimenOn(own, day),
      doses: ownDoses,
      stockEvents,
      forecast: stockForecast({
        regimens: own,
        doses: ownDoses,
        stockEvents,
        wastePct: treatment.wastePct,
        renewalLeadDays: treatment.renewalLeadDays,
        today: day,
      }),
      prescriptionAlertOn: treatment.prescriptionExpiresOn
        ? leadDate(treatment.prescriptionExpiresOn, treatment.prescriptionLeadDays)
        : null,
    };
  });
}

let doseRemindersSynced = false;

/**
 * Loads every treatment and reschedules its alerts, so the renewal date
 * follows each check-off. Dose reminders are synced once per app run and
 * whenever `doseReminders` is set (after an edit).
 */
export async function refreshTreatments(
  db: SQLiteDatabase,
  opts: { doseReminders?: boolean } = {},
): Promise<TreatmentState[]> {
  const states = await loadTreatments(db);
  const prefs = await loadReminderPrefs(db);
  const syncDoses = opts.doseReminders || !doseRemindersSynced;
  doseRemindersSynced = true;
  await Promise.all(
    states.map(async (s) => {
      if (syncDoses) await syncDoseReminders(s, prefs.treatments);
      await syncAlertReminders(s, prefs.renewal);
    }),
  ).catch(console.warn);
  return states;
}

/** One-tap check-off. A double tap on the same slot is ignored by the unique index. */
export async function logDose(db: SQLiteDatabase, state: TreatmentState, day: string, slot: number, status: DoseStatus) {
  const regimen = regimenOn(state.regimens, day) ?? state.regimen;
  const qty = status === "taken" && regimen ? regimen.doseQty : 0;
  await db.runAsync(
    "INSERT OR IGNORE INTO treatment_doses (treatment_id, day, slot, status, qty, taken_at) VALUES (?, ?, ?, ?, ?, ?)",
    state.treatment.id,
    day,
    slot,
    status,
    qty,
    new Date().toISOString(),
  );
}

export async function undoDose(db: SQLiteDatabase, doseId: number) {
  await db.runAsync(
    "UPDATE treatment_doses SET undone_at = ? WHERE id = ? AND undone_at IS NULL",
    new Date().toISOString(),
    doseId,
  );
}

export async function setDoseNote(db: SQLiteDatabase, doseId: number, note: string) {
  await db.runAsync("UPDATE treatment_doses SET note = ? WHERE id = ?", note.trim() || null, doseId);
}

export async function addStock(db: SQLiteDatabase, treatmentId: number, kind: "add" | "set", qty: number) {
  await db.runAsync(
    "INSERT INTO treatment_stock_events (treatment_id, kind, qty, at) VALUES (?, ?, ?, ?)",
    treatmentId,
    kind,
    qty,
    new Date().toISOString(),
  );
}

/**
 * Creates or updates a treatment. A dosage change becomes a new regimen from
 * today (a second change the same day replaces it), so past days keep the
 * dosage they were taken with.
 */
export async function saveTreatment(db: SQLiteDatabase, input: TreatmentInput, id?: number): Promise<number> {
  const day = today();
  const fields = [
    input.name.trim(),
    input.unit,
    input.packageSize,
    input.wastePct,
    input.reminderTime,
    input.renewalLeadDays,
    input.prescriptionExpiresOn,
    input.prescriptionLeadDays,
  ];
  let treatmentId = id;
  await db.withTransactionAsync(async () => {
    if (treatmentId === undefined) {
      const res = await db.runAsync(
        `INSERT INTO treatments (name, unit, package_size, waste_pct, reminder_time, renewal_lead_days,
           prescription_expires_on, prescription_lead_days, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM treatments))`,
        ...fields,
      );
      treatmentId = res.lastInsertRowId;
    } else {
      await db.runAsync(
        `UPDATE treatments SET name = ?, unit = ?, package_size = ?, waste_pct = ?, reminder_time = ?,
           renewal_lead_days = ?, prescription_expires_on = ?, prescription_lead_days = ? WHERE id = ?`,
        ...fields,
        treatmentId,
      );
    }
    const current = await db.getFirstAsync<{
      dose_qty: number;
      doses_per_day: number;
      frequency: string;
      weekdays: string | null;
    }>(
      "SELECT * FROM treatment_regimens WHERE treatment_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1",
      treatmentId,
      day,
    );
    const r = input.regimen;
    const weekdays = r.frequency === "weekdays" ? [...r.weekdays].sort((a, b) => a - b).join(",") : null;
    const changed =
      !current ||
      current.dose_qty !== r.doseQty ||
      current.doses_per_day !== r.dosesPerDay ||
      current.frequency !== r.frequency ||
      (current.weekdays ?? null) !== weekdays;
    if (changed) {
      await db.runAsync(
        `INSERT INTO treatment_regimens (treatment_id, effective_from, dose_qty, doses_per_day, frequency, weekdays)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (treatment_id, effective_from) DO UPDATE SET
           dose_qty = excluded.dose_qty, doses_per_day = excluded.doses_per_day,
           frequency = excluded.frequency, weekdays = excluded.weekdays`,
        treatmentId,
        day,
        r.doseQty,
        r.dosesPerDay,
        r.frequency,
        weekdays,
      );
    }
  });
  return treatmentId!;
}

/** Hides a treatment and its reminders; its history stays in the database. */
export async function archiveTreatment(db: SQLiteDatabase, id: number) {
  await db.runAsync("UPDATE treatments SET archived_at = ? WHERE id = ?", new Date().toISOString(), id);
  await cancelScheduled([...doseReminderIds(id), renewalId(id), prescriptionId(id)]);
}

const doseReminderIds = (id: number) => [`treatment-${id}`, ...[1, 2, 3, 4, 5, 6, 7].map((w) => `treatment-${id}-wd${w}`)];
const renewalId = (id: number) => `treatment-${id}-renewal`;
const prescriptionId = (id: number) => `treatment-${id}-rx`;

async function syncDoseReminders({ treatment: t, regimen }: TreatmentState, enabled: boolean) {
  await cancelScheduled(doseReminderIds(t.id));
  if (!enabled || !t.reminderTime || !regimen || regimen.frequency === "as_needed") return;
  const [hour, minute] = t.reminderTime.split(":").map(Number);
  const title = t.name;
  const body = `${formatQty(regimen.doseQty, t.unit)}${regimen.dosesPerDay > 1 ? ` × ${regimen.dosesPerDay}` : ""}`;
  const extra = { domain: "sante", category: "treatment", url: `/sante/traitements/${t.id}`, data: { treatmentId: t.id } } as const;
  if (regimen.frequency === "daily") {
    await scheduleDaily(`treatment-${t.id}`, title, body, hour, minute, CHANNEL_TREATMENTS, extra);
  } else {
    for (const w of regimen.weekdays) {
      await scheduleWeekly(`treatment-${t.id}-wd${w}`, title, body, w, hour, minute, CHANNEL_TREATMENTS, extra);
    }
  }
}

async function syncAlertReminders({ treatment: t, forecast, prescriptionAlertOn }: TreatmentState, enabled: boolean) {
  const extra = { domain: "sante", url: `/sante/traitements/${t.id}` } as const;
  if (!enabled) {
    await cancelScheduled([renewalId(t.id), prescriptionId(t.id)]);
    return;
  }
  if (forecast.renewalAlertOn && forecast.runOutOn) {
    await scheduleAt(
      renewalId(t.id),
      `Stock : ${t.name}`,
      `Environ ${t.renewalLeadDays} jours de stock (épuisement estimé le ${shortFrDate(forecast.runOutOn)}).`,
      atLocalTime(forecast.renewalAlertOn, ALERT_HOUR),
      CHANNEL_TREATMENTS,
      extra,
    );
  } else {
    await cancelScheduled([renewalId(t.id)]);
  }
  if (t.prescriptionExpiresOn && prescriptionAlertOn) {
    await scheduleAt(
      prescriptionId(t.id),
      `Ordonnance ${t.name}`,
      `Elle expire le ${formatFrDate(t.prescriptionExpiresOn)}.`,
      atLocalTime(prescriptionAlertOn, ALERT_HOUR),
      CHANNEL_TREATMENTS,
      extra,
    );
  } else {
    await cancelScheduled([prescriptionId(t.id)]);
  }
}

export type TreatmentAlert = { key: string; tone: "warn" | "danger"; text: string };

/** Alerts due today; shown in Today whether or not notifications work. */
export function dueAlerts(states: TreatmentState[], day = today()): TreatmentAlert[] {
  const alerts: TreatmentAlert[] = [];
  for (const { treatment: t, forecast: f, prescriptionAlertOn } of states) {
    if (f.remaining !== null && f.remaining <= 0) {
      alerts.push({ key: `stock-${t.id}`, tone: "danger", text: `${t.name} : stock épuisé selon les pointages.` });
    } else if (f.renewalAlertOn && f.runOutOn && f.renewalAlertOn <= day) {
      alerts.push({
        key: `stock-${t.id}`,
        tone: "warn",
        text: `${t.name} : environ ${Math.floor(f.daysLeft ?? 0)} j de stock (épuisement estimé le ${shortFrDate(f.runOutOn)}).`,
      });
    }
    if (t.prescriptionExpiresOn && t.prescriptionExpiresOn < day) {
      alerts.push({
        key: `rx-${t.id}`,
        tone: "danger",
        text: `Ordonnance ${t.name} expirée depuis le ${formatFrDate(t.prescriptionExpiresOn)}.`,
      });
    } else if (t.prescriptionExpiresOn && prescriptionAlertOn && prescriptionAlertOn <= day) {
      alerts.push({
        key: `rx-${t.id}`,
        tone: "warn",
        text: `Ordonnance ${t.name} : expire le ${formatFrDate(t.prescriptionExpiresOn)}.`,
      });
    }
  }
  return alerts;
}

const qtyFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** "1 comprimé", "2 gélules", "2 ml". */
export function formatQty(qty: number, unit: string): string {
  const plural = unit !== "ml" && Math.abs(qty) >= 2 ? "s" : "";
  return `${qtyFormat.format(qty)} ${unit}${plural}`;
}

const WEEKDAY_LABELS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

export const WEEKDAY_OPTIONS = WEEKDAY_LABELS.map((label, i) => ({ value: String(i + 1), label }));

export function describeRegimen(r: Regimen, unit: string): string {
  const dose = `${formatQty(r.doseQty, unit)}${r.dosesPerDay > 1 ? ` × ${r.dosesPerDay}/jour` : ""}`;
  if (r.frequency === "as_needed") return `${dose} · à la demande`;
  if (r.frequency === "daily") return `${dose} · tous les jours`;
  return `${dose} · ${r.weekdays.map((w) => WEEKDAY_LABELS[w - 1]).join(", ")}`;
}

/** "Comprimé", "Gélule", "Flacon": the form a treatment is counted in. */
export function formLabel(unit: string): string {
  if (unit === "ml") return "Flacon";
  return unit.charAt(0).toUpperCase() + unit.slice(1);
}

/** Stock in the words of the box: "33 gélules", "2 flacons", or null when never entered. */
export function stockShort({ treatment: t, forecast: f }: Pick<TreatmentState, "treatment" | "forecast">): string | null {
  if (f.remaining === null) return null;
  if (t.unit === "ml" && t.packageSize) {
    const { opened, reserve } = supplySplit(f.remaining, t.packageSize);
    const bottles = reserve + (opened > 0 ? 1 : 0);
    return `${bottles} flacon${bottles > 1 ? "s" : ""}`;
  }
  return formatQty(Math.max(0, Math.floor(f.remaining)), t.unit);
}

/** "Stock 34 gélules · fin estimée 21 déc." for a dose not yet taken. */
export function stockLine(s: Pick<TreatmentState, "treatment" | "forecast">): string {
  const stock = stockShort(s);
  if (!stock) return "Stock non renseigné";
  const end = s.forecast.runOutOn ? ` · fin estimée ${shortFrDate(s.forecast.runOutOn)}` : "";
  return s.treatment.unit === "ml" ? `${stock} en stock${end}` : `Stock ${stock}${end}`;
}
