import { useCallback, useEffect, useState } from "react";
import { Image, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  AddRow,
  Badge,
  Button,
  Card,
  DayBars,
  DomainScope,
  EmptyState,
  Icon,
  LocalBadge,
  Notice,
  PressableScale,
  ProgressBar,
  radius,
  Screen,
  SectionTitle,
  Segmented,
  SkeletonCard,
  space,
  Txt,
  useSnackbar,
  useTheme,
} from "@/components/ui";
import { dayProgress } from "@/lib/adherence";
import { atLocalTime, shortFrDate, today } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
import { refreshHairChecks, type HairState } from "@/lib/hairChecks";
import { ZONES } from "@/lib/hairPhotos";
import { loadNights } from "@/lib/nights";
import { nightsDetail, previousNights, weekdayInitial, type Bucket, type Night } from "@/lib/sleep";
import { isScheduled } from "@/lib/stock";
import { addStock, formLabel, refreshTreatments, stockShort, type TreatmentState } from "@/lib/treatments";

type Tab = "suivi" | "traitements";

/**
 * Health, 100 % local: the tracked measures (hair photos, sleep) and the
 * treatments with their stock. Nothing here is ever sent to the server.
 */
export default function HealthScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === "traitements" ? "traitements" : "suivi");
  const [hair, setHair] = useState<HairState | null>(null);
  const [nights, setNights] = useState<Night[]>([]);
  const [treatments, setTreatments] = useState<TreatmentState[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.tab === "traitements" || params.tab === "suivi") setTab(params.tab);
  }, [params.tab]);

  const load = useCallback(async () => {
    try {
      const [h, n, tr] = await Promise.all([refreshHairChecks(db), loadNights(db), refreshTreatments(db)]);
      setHair(h);
      setNights(n);
      setTreatments(tr);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen title="Santé" subtitle="Suivi et traitements" domain="sante">
      <LocalBadge />
      <Segmented
        options={[
          { value: "suivi", label: "Suivi" },
          { value: "traitements", label: "Traitements" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {error ? (
        <Notice tone="danger" title="Lecture impossible" action={{ label: "Réessayer", onPress: load }}>
          Les données de santé n'ont pas pu être lues sur le téléphone. {error}
        </Notice>
      ) : null}
      {!treatments || !hair ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : tab === "suivi" ? (
        <Follow hair={hair} nights={nights} treatments={treatments} />
      ) : (
        <Treatments states={treatments} onChanged={load} />
      )}
    </Screen>
  );
}

function Follow({ hair, nights, treatments }: { hair: HairState; nights: Night[]; treatments: TreatmentState[] }) {
  const t = useTheme();
  const day = today();
  const recent = hair.checks.filter((c) => c.completedAt).slice(0, 4).reverse();
  const previous = previousNights(nights, day);
  return (
    <>
      <Card index={0}>
        <PressableScale
          accessibilityRole="link"
          accessibilityLabel="Cheveux, photos mensuelles, 4 zones. Ouvrir le suivi"
          onPress={() => router.push("/sante/cheveux")}
          style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 48 }}
        >
          <Icon name="camera-outline" size={24} color={t.domain.sante.accentText} />
          <View style={{ flex: 1 }}>
            <Txt>Cheveux</Txt>
            <Txt variant="callout" tone="muted">
              Photos · mensuel · {ZONES.length} zones
            </Txt>
          </View>
          <Icon name="chevron-forward" size={20} color={t.textMuted} />
        </PressableScale>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          {Array.from({ length: 4 }, (_, i) => {
            const check = recent[i - (4 - recent.length)];
            const photo = check?.photos.find((p) => p.zone === "frontal") ?? check?.photos[0];
            return (
              <View key={i} style={{ flex: 1, gap: 4, alignItems: "center" }}>
                <View style={{ width: "100%", aspectRatio: 1.25, borderRadius: radius.sm, backgroundColor: t.surfaceAlt, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
                  {photo ? (
                    <Image source={{ uri: photo.thumbUri }} resizeMode="cover" style={{ width: "100%", height: "100%" }} accessibilityIgnoresInvertColors />
                  ) : (
                    <Icon name="person-outline" size={18} color={t.textSubtle} />
                  )}
                </View>
                <Txt variant="caption" tone="muted">
                  {check ? atLocalTime(check.day, 12).toLocaleDateString("fr-FR", { month: "short" }) : "—"}
                </Txt>
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
          <Txt variant="caption" tone={hair.overdue ? "warning" : "muted"}>
            {hair.open
              ? `Série commencée · ${hair.open.photos.length} / ${ZONES.length} zones`
              : hair.overdue
                ? `Série en retard de ${hair.overdue} j`
                : `Prochaine série : ${shortFrDate(hair.due)}`}
          </Txt>
          {treatments.length ? (
            <Txt variant="caption" tone="muted">
              {treatments.length} traitement{treatments.length > 1 ? "s" : ""} suivi{treatments.length > 1 ? "s" : ""}
            </Txt>
          ) : null}
        </View>
        <Button
          variant="soft"
          icon="camera-outline"
          label={hair.open ? "Reprendre la série" : "Prendre les photos du mois"}
          onPress={() => router.push("/hair-check")}
        />
      </Card>

      <Card index={1}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 48 }}>
          <Icon name="moon-outline" size={24} color={t.domain.sommeil.accentText} />
          <View style={{ flex: 1 }}>
            <Txt>Sommeil</Txt>
            <Txt variant="callout" tone="muted">
              Durée · chaque nuit · saisi depuis Aujourd'hui
            </Txt>
          </View>
        </View>
        <View style={{ gap: space.sm }}>
          <DayBarsSleep previous={previous} />
          <Txt variant="caption" tone="muted">
            {nightsDetail(previous.map((n) => n.bucket))}
          </Txt>
        </View>
      </Card>
    </>
  );
}

/** Nights of 7 h or more in the sleep colour, shorter or missing ones in grey. */
function DayBarsSleep({ previous }: { previous: { day: string; bucket: Bucket | null }[] }) {
  return (
    <DomainScope domain="sommeil">
      <DayBars
        height={40}
        label={nightsDetail(previous.map((n) => n.bucket))}
        days={previous.map((n) => ({
          label: weekdayInitial(n.day),
          ratio: n.bucket === null ? 0.08 : (n.bucket + 1) / 4,
          muted: n.bucket === null || n.bucket < 2,
        }))}
      />
    </DomainScope>
  );
}

function Treatments({ states, onChanged }: { states: TreatmentState[]; onChanged: () => void }) {
  const db = useSQLiteContext();
  const snackbar = useSnackbar();
  const day = today();
  const due = states.filter((s) => s.forecast.renewalAlertOn && s.forecast.runOutOn && s.forecast.renewalAlertOn <= day);
  const { expected, logged } = dayProgress(states, day);

  const renewed = async (s: TreatmentState) => {
    if (!s.treatment.packageSize) {
      router.push({ pathname: "/sante/traitements/[id]", params: { id: String(s.treatment.id) } });
      return;
    }
    haptics.success();
    await addStock(db, s.treatment.id, "add", s.treatment.packageSize);
    const last = await db.getFirstAsync<{ id: number }>("SELECT MAX(id) AS id FROM treatment_stock_events WHERE treatment_id = ?", s.treatment.id);
    onChanged();
    snackbar.show({
      message: `${s.treatment.name} : ${s.treatment.unit === "ml" ? "flacon" : "boîte"} ajouté au stock`,
      undo: async () => {
        if (last?.id) await db.runAsync("DELETE FROM treatment_stock_events WHERE id = ?", last.id);
        onChanged();
      },
    });
  };

  if (states.length === 0) {
    return (
      <EmptyState
        icon="medkit-outline"
        title="Aucun traitement"
        body="Nom, forme, prises, stock : tu saisis, l'app décompte et rappelle."
        action={{ label: "Ajouter un traitement", onPress: () => router.push("/sante/traitements/modifier") }}
      />
    );
  }

  return (
    <>
      {due.slice(0, 1).map((s) => (
        <Notice
          key={s.treatment.id}
          tone="warning"
          title={`Renouveler dans ${Math.max(0, Math.floor(s.forecast.daysLeft ?? 0))} jours`}
          action={{ label: "Renouvelé", onPress: () => renewed(s) }}
        >
          {s.treatment.name} : {stockShort(s)} restant{(s.forecast.remaining ?? 0) > 1 ? "s" : ""}, fin estimée le {shortFrDate(s.forecast.runOutOn!)}.
        </Notice>
      ))}
      <SectionTitle right={expected ? `${logged} / ${expected} fait aujourd'hui` : undefined}>
        {states.length} traitement{states.length > 1 ? "s" : ""}
      </SectionTitle>
      {states.map((s, i) => (
        <TreatmentSummary key={s.treatment.id} state={s} index={i} alert={due.includes(s)} onRenewed={() => renewed(s)} />
      ))}
      <AddRow label="Ajouter un traitement" hint="Nom, forme, prises, stock : tu saisis, l'app rappelle" onPress={() => router.push("/sante/traitements/modifier")} />
    </>
  );
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

function TreatmentSummary({ state: s, index, alert, onRenewed }: { state: TreatmentState; index: number; alert: boolean; onRenewed: () => void }) {
  const t = useTheme();
  const day = today();
  const tr = s.treatment;
  const r = s.regimen;
  const scheduled = isScheduled(r, day);
  const todays = s.doses.filter((d) => d.day === day);
  const lastTaken = todays.filter((d) => d.status === "taken").pop();
  const done = scheduled && r ? todays.length >= r.dosesPerDay : false;
  const nowHm = new Date().toTimeString().slice(0, 5);
  const status = !scheduled
    ? r?.frequency === "as_needed"
      ? { label: lastTaken ? `Prise ${time(lastTaken.takenAt)}` : "À la demande", done: !!lastTaken }
      : { label: "Pas aujourd'hui", done: false }
    : done
      ? lastTaken
        ? { label: `Fait ${time(lastTaken.takenAt)}`, done: true }
        : { label: "Noté manqué", done: false }
      : tr.reminderTime && tr.reminderTime > nowHm && tr.reminderTime >= "18:00"
        ? { label: "Ce soir", done: false }
        : { label: "À faire", done: false };
  const freq = !r ? "pas de posologie" : r.frequency === "as_needed" ? "à la demande" : r.frequency === "daily" ? `${r.dosesPerDay} par jour` : `${r.weekdays.length} jours / semaine`;
  const stock = s.forecast.remaining;
  const capacity = tr.packageSize ? Math.max(tr.packageSize, stock ?? 0) : null;
  return (
    <Card index={index + 1} style={{ gap: space.sm }}>
      <PressableScale
        accessibilityRole="link"
        accessibilityLabel={`${tr.name}, ${status.label}. Ouvrir le détail`}
        onPress={() => router.push({ pathname: "/sante/traitements/[id]", params: { id: String(tr.id) } })}
        style={{ gap: space.sm }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Txt variant="headline">{tr.name}</Txt>
            <Txt variant="caption" tone="muted">
              {formLabel(tr.unit)} · {freq}
              {tr.reminderTime ? ` · rappel ${tr.reminderTime}` : ""}
            </Txt>
          </View>
          <Badge color={status.done ? "sante" : "neutral"} icon={status.done ? "checkmark" : undefined} label={status.label} />
        </View>
        {stock !== null ? (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Txt variant="callout">Stock</Txt>
              <Txt variant="label" style={{ fontVariant: ["tabular-nums"] }}>
                {tr.unit === "ml" && tr.packageSize ? stockShort(s) : `${Math.max(0, Math.floor(stock))}${capacity ? ` / ${capacity}` : ""}`}
              </Txt>
            </View>
            {capacity ? <ProgressBar value={Math.max(0, stock) / capacity} height={6} color={alert ? t.warning : undefined} label="Stock restant" /> : null}
            <Txt variant="caption" tone={alert ? "warning" : "muted"}>
              {s.forecast.runOutOn ? `Fin estimée ${shortFrDate(s.forecast.runOutOn)}` : "Fin non estimée"}
              {alert ? ` · alerte ${tr.renewalLeadDays} jours avant` : ""}
            </Txt>
          </>
        ) : (
          <Txt variant="caption" tone="muted">
            Stock non renseigné : touche pour le saisir.
          </Txt>
        )}
      </PressableScale>
      {alert ? (
        <View style={{ alignItems: "flex-end" }}>
          <Button variant="ghost" size="sm" label="Renouvelé" onPress={onRenewed} />
        </View>
      ) : null}
    </Card>
  );
}
