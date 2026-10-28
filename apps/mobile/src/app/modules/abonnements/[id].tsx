import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Button, Card, Chips, Field, FormErrorSummary, Notice, Screen, Segmented, space, Txt, useFormErrors } from "@/components/ui";
import { formatFrDate, parseFrDate, shortFrDate, today } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
import { centsToInput, formatCents, parseEuros } from "@/lib/money";
import { cycleLabel, monthlyCents, nextRenewals, type CycleUnit } from "@/lib/renewals";
import {
  CATEGORY_LABEL,
  cancellationUrl,
  deleteSubscription,
  loadSubscriptions,
  openCancellation,
  refreshSubscriptions,
  saveSubscription,
  setSubscriptionStatus,
  SUBSCRIPTION_CATEGORIES,
  type Billing,
  type SubscriptionCategory,
} from "@/lib/subscriptions";

type Errors = Partial<Record<"name" | "price" | "count" | "anchor" | "trial" | "reminder" | "url", string>>;

export default function SubscriptionEditScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";

  const [name, setName] = useState("");
  const [category, setCategory] = useState<SubscriptionCategory>("streaming");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState<CycleUnit>("month");
  const [count, setCount] = useState("1");
  const [anchor, setAnchor] = useState(formatFrDate(today()));
  const [trial, setTrial] = useState("");
  const [reminder, setReminder] = useState("3");
  const [billing, setBilling] = useState<Billing>("direct");
  const [cancelUrl, setCancelUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"active" | "cancelled">("active");
  // Keeps the stored anchor when the date field is left as loaded, so a 31st stays a 31st.
  const [loadedAnchor, setLoadedAnchor] = useState<{ text: string; anchorOn: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    loadSubscriptions(db).then((subs) => {
      const s = subs.find((x) => x.id === Number(id));
      if (!s) return;
      setName(s.name);
      setCategory(s.category);
      setPrice(centsToInput(s.priceCents));
      setUnit(s.cycle.unit);
      setCount(String(s.cycle.count));
      // Show the next billing date rather than the original anchor: same sequence, easier to check.
      const shown = formatFrDate(s.status === "active" ? s.nextOn : s.anchorOn);
      setAnchor(shown);
      setLoadedAnchor({ text: shown, anchorOn: s.anchorOn });
      setTrial(s.trialEndsOn ? formatFrDate(s.trialEndsOn) : "");
      setReminder(String(s.reminderDays));
      setBilling(s.billing);
      setCancelUrl(s.cancelUrl ?? "");
      setNotes(s.notes ?? "");
      setStatus(s.status);
    });
  }, [db, id, isNew]);

  const priceCents = parseEuros(price);
  const cycleCount = Number(count);
  const cycle = { unit, count: Number.isInteger(cycleCount) && cycleCount > 0 ? cycleCount : 1 };
  const anchorDay = parseFrDate(anchor);

  const validate = (): Errors => {
    const trialDay = trial.trim() ? parseFrDate(trial) : null;
    const reminderDays = Number(reminder);
    const next: Errors = {};
    if (!name.trim()) next.name = "Donne un nom.";
    if (priceCents === null || priceCents <= 0) next.price = "Montant en euros, par exemple 9,99.";
    if (!(Number.isInteger(cycleCount) && cycleCount >= 1)) next.count = "Nombre entier, au moins 1.";
    if (!anchorDay) next.anchor = "Format JJ/MM/AAAA.";
    if (trial.trim() && !trialDay) next.trial = "Format JJ/MM/AAAA, ou vide.";
    if (!(Number.isInteger(reminderDays) && reminderDays >= 0 && reminderDays <= 30)) next.reminder = "Entre 0 et 30 jours.";
    if (billing === "direct" && cancelUrl.trim() && !/^https?:\/\//.test(cancelUrl.trim())) next.url = "Adresse complète, commençant par https://";
    return next;
  };
  const { errors, edit, blur, submit } = useFormErrors(validate);

  const save = async () => {
    if (!submit()) {
      haptics.warning();
      return;
    }
    const trialDay = trial.trim() ? parseFrDate(trial) : null;
    const reminderDays = Number(reminder);
    setSaving(true);
    try {
      await saveSubscription(
        db,
        {
          name,
          category,
          priceCents: priceCents!,
          cycle,
          anchorOn: loadedAnchor && anchor === loadedAnchor.text ? loadedAnchor.anchorOn : anchorDay!,
          trialEndsOn: trialDay,
          reminderDays,
          billing,
          cancelUrl: billing === "direct" ? cancelUrl : null,
          notes,
        },
        isNew ? undefined : Number(id),
      );
      await refreshSubscriptions(db);
      haptics.success();
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    const opened = await openCancellation({ billing, cancelUrl: cancelUrl.trim() || null });
    const markCancelled = async () => {
      await setSubscriptionStatus(db, Number(id), "cancelled");
      haptics.success();
      router.back();
    };
    Alert.alert(
      opened ? "As-tu résilié ?" : "Pas de lien de résiliation",
      opened
        ? "Marque l'abonnement comme résilié une fois la résiliation confirmée par le service."
        : "Ajoute la page de résiliation du service, ou marque-le directement comme résilié.",
      [
        { text: "Pas encore", style: "cancel" },
        { text: "Marquer résilié", onPress: markCancelled },
      ],
    );
  };

  const reactivate = async () => {
    await setSubscriptionStatus(db, Number(id), "active");
    await refreshSubscriptions(db);
    router.back();
  };

  const remove = () =>
    Alert.alert("Supprimer cet abonnement ?", "Il disparaît définitivement de l'app. Pour garder l'historique, marque-le plutôt comme résilié.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          await deleteSubscription(db, Number(id));
          router.back();
        },
      },
    ]);

  const preview =
    priceCents && anchorDay ? nextRenewals(anchorDay, cycle, today(), 3).map(shortFrDate).join(", ") : null;

  return (
    <Screen back title={isNew ? "Nouvel abonnement" : name || "Abonnement"} subtitle={status === "cancelled" ? "Résilié" : undefined}>
      <Card title="Abonnement" icon="card-outline" color="subs" index={0}>
        <Field label="Nom" value={name} onChangeText={edit("name", setName)} error={errors.name} placeholder="ex. Netflix" />
        <View style={{ gap: 6 }}>
          <Txt variant="caption" tone="muted">
            Catégorie
          </Txt>
          <Chips
            options={SUBSCRIPTION_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
            value={category}
            onChange={setCategory}
          />
        </View>
      </Card>

      <Card title="Prix et cycle" icon="cash-outline" color="subs" index={1}>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 3 }}>
            <Field label="Prix (€)" value={price} onChangeText={edit("price", setPrice)} onBlur={blur("price", price)} keyboardType="decimal-pad" error={errors.price} placeholder="9,99" />
          </View>
          <View style={{ flex: 2 }}>
            <Field label="Tous les" value={count} onChangeText={edit("count", setCount)} onBlur={blur("count", count)} keyboardType="number-pad" error={errors.count} />
          </View>
        </View>
        <Segmented
          value={unit}
          onChange={setUnit}
          options={[
            { value: "week", label: "Semaines" },
            { value: "month", label: "Mois" },
            { value: "year", label: "Ans" },
          ]}
        />
        <Field
          label="Prochain prélèvement"
          helper="JJ/MM/AAAA. Les suivants sont calculés automatiquement."
          value={anchor}
          onChangeText={edit("anchor", setAnchor)}
          onBlur={blur("anchor", anchor)}
          keyboardType="numbers-and-punctuation"
          error={errors.anchor}
        />
        {priceCents && preview ? (
          <Notice tone="info">
            {formatCents(priceCents)} {cycleLabel(cycle)}, soit {formatCents(Math.round(monthlyCents(priceCents, cycle)))} par mois. Prochains : {preview}.
          </Notice>
        ) : null}
      </Card>

      <Card title="Rappels" icon="notifications-outline" color="primary" index={2}>
        <Field
          label="Fin de l'essai gratuit"
          helper="JJ/MM/AAAA, vide s'il n'y a pas d'essai."
          value={trial}
          onChangeText={edit("trial", setTrial)}
          onBlur={blur("trial", trial)}
          keyboardType="numbers-and-punctuation"
          error={errors.trial}
        />
        <Field label="Me prévenir (jours avant)" value={reminder} onChangeText={edit("reminder", setReminder)} onBlur={blur("reminder", reminder)} keyboardType="number-pad" error={errors.reminder} />
      </Card>

      <Card title="Résiliation" icon="exit-outline" color="danger" index={3}>
        <Segmented
          value={billing}
          onChange={setBilling}
          options={[
            { value: "direct", label: "Auprès du service" },
            { value: "google_play", label: "Google Play" },
          ]}
        />
        {billing === "direct" ? (
          <Field
            label="Page de résiliation"
            value={cancelUrl}
            onChangeText={edit("url", setCancelUrl)}
            onBlur={blur("url", cancelUrl)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://…"
            error={errors.url}
          />
        ) : (
          <Txt variant="caption" tone="muted">
            Android ne permet pas de résilier depuis une autre app : le bouton ouvrira la page Abonnements de Google Play.
          </Txt>
        )}
        <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Facultatif" multiline />
      </Card>

      <FormErrorSummary errors={errors} />
      <Button label="Enregistrer" icon="checkmark" onPress={save} loading={saving} />
      {!isNew && status === "active" ? (
        <Button
          label={cancellationUrl({ billing, cancelUrl: cancelUrl.trim() || null }) ? "Résilier" : "Marquer résilié"}
          icon="exit-outline"
          variant="danger"
          onPress={cancel}
        />
      ) : null}
      {!isNew && status === "cancelled" ? <Button label="Réactiver" icon="refresh" variant="secondary" onPress={reactivate} /> : null}
      {!isNew ? <Button label="Supprimer" icon="trash-outline" variant="ghost" onPress={remove} /> : null}
    </Screen>
  );
}
