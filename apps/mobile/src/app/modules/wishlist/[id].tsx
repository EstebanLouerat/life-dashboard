import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Button, Card, Chips, Field, FormErrorSummary, Notice, Screen, Segmented, space, Txt, useFormErrors } from "@/components/ui";
import { formatFrDate } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
import { centsToInput, formatCents, parseEuros } from "@/lib/money";
import type { Priority } from "@/lib/savings";
import {
  coolingLeft,
  deleteWish,
  DEFAULT_WISH_CATEGORIES,
  endCooling,
  loadWishlist,
  PRIORITY_LABEL,
  refreshWishlist,
  saveWish,
  setWishStatus,
  type WishItem,
} from "@/lib/wishlist";

type Errors = Partial<Record<"name" | "price" | "category" | "url" | "paid", string>>;

export default function WishEditScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";

  const [item, setItem] = useState<WishItem | null>(null);
  const [categories, setCategories] = useState<string[]>(DEFAULT_WISH_CATEGORIES);
  const [coolingDays, setCoolingDays] = useState(30);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState(DEFAULT_WISH_CATEGORIES[0]);
  const [newCategory, setNewCategory] = useState("");
  const [priority, setPriority] = useState<Priority>(2);
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [cooling, setCooling] = useState<"yes" | "no">("yes");
  const [paid, setPaid] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadWishlist(db).then((state) => {
      setCategories(state.categories);
      setCoolingDays(state.settings.coolingDays);
      if (state.settings.coolingDays === 0) setCooling("no");
      if (isNew) return;
      const found = state.items.find((x) => x.id === Number(id));
      if (!found) return;
      setItem(found);
      setName(found.name);
      setPrice(centsToInput(found.priceCents));
      setCategory(found.category);
      setPriority(found.priority);
      setUrl(found.url ?? "");
      setNotes(found.notes ?? "");
      setPaid(centsToInput(found.paidCents ?? found.priceCents));
    });
  }, [db, id, isNew]);

  const validate = (): Errors => {
    const priceCents = parseEuros(price);
    const next: Errors = {};
    if (!name.trim()) next.name = "Donne un nom.";
    if (priceCents === null || priceCents <= 0) next.price = "Prix en euros, par exemple 129,99.";
    if (!(newCategory.trim() || category)) next.category = "Choisis ou crée une catégorie.";
    if (url.trim() && !/^https?:\/\//.test(url.trim())) next.url = "Adresse complète, commençant par https://";
    return next;
  };
  const { errors, setErrors, edit, blur, submit } = useFormErrors(validate);

  const save = async () => {
    if (!submit()) {
      haptics.warning();
      return;
    }
    const priceCents = parseEuros(price);
    const finalCategory = newCategory.trim() || category;
    setSaving(true);
    try {
      await saveWish(
        db,
        { name, category: finalCategory, priceCents: priceCents!, priority, url, notes, cooling: cooling === "yes" },
        coolingDays,
        isNew ? undefined : Number(id),
      );
      await refreshWishlist(db);
      haptics.success();
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const markBought = () => {
    const paidCents = parseEuros(paid);
    if (paidCents === null) {
      setErrors({ ...errors, paid: "Montant en euros." });
      return;
    }
    const buy = async () => {
      await setWishStatus(db, Number(id), "bought", paidCents);
      haptics.success();
      router.back();
    };
    const left = item ? coolingLeft(item) : 0;
    if (left > 0) {
      Alert.alert("Période de réflexion en cours", `Encore ${left} jour${left > 1 ? "s" : ""} avant la fin de la réflexion. L'acheter quand même ?`, [
        { text: "Attendre", style: "cancel" },
        { text: "Acheter quand même", onPress: buy },
      ]);
    } else {
      buy();
    }
  };

  const changeStatus = async (status: "dropped" | "wanted") => {
    await setWishStatus(db, Number(id), status);
    haptics.success();
    router.back();
  };

  const remove = () =>
    Alert.alert("Supprimer cette envie ?", "Elle disparaît définitivement, y compris du bilan.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          await deleteWish(db, Number(id));
          router.back();
        },
      },
    ]);

  const left = item ? coolingLeft(item) : 0;

  return (
    <Screen back title={isNew ? "Nouvelle envie" : name || "Envie"}>
      <Card title="Envie" icon="gift-outline" color="wish" index={0}>
        <Field label="Nom" value={name} onChangeText={edit("name", setName)} error={errors.name} placeholder="ex. Écran 27 pouces" />
        <Field label="Prix (€)" value={price} onChangeText={edit("price", setPrice)} onBlur={blur("price", price)} keyboardType="decimal-pad" error={errors.price} placeholder="249,99" />
        <View style={{ gap: 6 }}>
          <Txt variant="caption" tone="muted">
            Priorité
          </Txt>
          <Segmented
            value={String(priority)}
            onChange={(v) => setPriority(Number(v) as Priority)}
            options={([1, 2, 3] as const).map((p) => ({ value: String(p), label: PRIORITY_LABEL[p] }))}
          />
        </View>
        <View style={{ gap: 6 }}>
          <Txt variant="caption" tone="muted">
            Catégorie
          </Txt>
          <Chips
            options={categories.map((c) => ({ value: c, label: c }))}
            value={newCategory.trim() ? "" : category}
            onChange={(c) => {
              setCategory(c);
              setNewCategory("");
            }}
          />
          <Field label="Ou nouvelle catégorie" value={newCategory} onChangeText={edit("category", setNewCategory)} error={errors.category} placeholder="ex. Voyage" />
        </View>
      </Card>

      <Card title="Détails" icon="link-outline" color="primary" index={1}>
        <Field
          label="Lien"
          value={url}
          onChangeText={edit("url", setUrl)}
          onBlur={blur("url", url)}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://…"
          error={errors.url}
        />
        <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Modèle, taille, alternatives…" multiline />
      </Card>

      {isNew ? (
        <Card title="Période de réflexion" icon="hourglass-outline" color="warning" index={2}>
          {coolingDays > 0 ? (
            <>
              <Segmented
                value={cooling}
                onChange={setCooling}
                options={[
                  { value: "yes", label: `Oui, ${coolingDays} jours` },
                  { value: "no", label: "Non" },
                ]}
              />
              <Txt variant="caption" tone="muted">
                Tu seras prévenu à la fin de la réflexion pour décider à froid.
              </Txt>
            </>
          ) : (
            <Txt variant="callout" tone="muted">
              Désactivée dans les règles de la wishlist.
            </Txt>
          )}
        </Card>
      ) : item?.status === "wanted" && left > 0 ? (
        <Card title="Période de réflexion" icon="hourglass-outline" color="warning" index={2}>
          <Notice tone="warning">
            Encore {left} jour{left > 1 ? "s" : ""}, jusqu'au {formatFrDate(item.coolingUntil!)}.
          </Notice>
          <Button
            size="sm"
            variant="secondary"
            label="Lever la réflexion"
            onPress={async () => {
              await endCooling(db, item.id);
              setItem({ ...item, coolingUntil: null });
            }}
          />
        </Card>
      ) : null}

      <FormErrorSummary errors={errors} />
      <Button label="Enregistrer" icon="checkmark" onPress={save} loading={saving} />

      {item?.status === "wanted" ? (
        <Card title="Décision" icon="flag-outline" color="wish" index={3}>
          <Field label="Prix payé (€)" value={paid} onChangeText={edit("paid", setPaid)} keyboardType="decimal-pad" error={errors.paid} />
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button size="sm" icon="bag-check-outline" label="Acheté" onPress={markBought} />
            </View>
            <View style={{ flex: 1 }}>
              <Button size="sm" variant="secondary" icon="close-circle-outline" label="Abandonner" onPress={() => changeStatus("dropped")} />
            </View>
          </View>
          <Txt variant="caption" tone="muted">
            Abandonner compte {item ? formatCents(item.priceCents) : ""} dans « Économisé ».
          </Txt>
        </Card>
      ) : null}
      {item && item.status !== "wanted" ? <Button label="Remettre dans les envies" icon="refresh" variant="secondary" onPress={() => changeStatus("wanted")} /> : null}
      {!isNew ? <Button label="Supprimer" icon="trash-outline" variant="ghost" onPress={remove} /> : null}
    </Screen>
  );
}
