import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  Badge,
  Button,
  Card,
  Chips,
  EmptyState,
  Field,
  IconButton,
  ListRow,
  MiniBars,
  Notice,
  ProgressBar,
  Screen,
  SectionTitle,
  Segmented,
  Sheet,
  SkeletonCard,
  space,
  Stat,
  StatGrid,
  Txt,
  useSnackbar,
  useTheme,
} from "@/components/ui";
import { atLocalTime, formatFrDate, today } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
import { centsToInput, formatCents, parseEuros } from "@/lib/money";
import { fundingOrder, monthlySaved, monthOf } from "@/lib/savings";
import {
  coolingLeft,
  PRIORITY_LABEL,
  refreshWishlist,
  saveBalance,
  saveWishlistSettings,
  tracksSavings,
  type WishItem,
  type WishlistState,
} from "@/lib/wishlist";

const monthName = (month: string, style: "long" | "short" = "long") =>
  atLocalTime(`${month}-15`, 12).toLocaleDateString("fr-FR", { month: style });

const monthsAhead = (day: string, months: number) => {
  const [y, m] = day.split("-").map(Number);
  return new Date(y, m - 1 + months, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
};

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/**
 * Wishes by category, the one savings are going to first, and the monthly
 * top-up in one tap. Bought and dropped items, the totals and the rules
 * (monthly goal, cooling-off) sit below.
 */
export default function WishlistScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const snackbar = useSnackbar();
  const [state, setState] = useState<WishlistState | null>(null);
  const [category, setCategory] = useState("all");
  const [closed, setClosed] = useState<"bought" | "dropped">("bought");
  const [balanceSheet, setBalanceSheet] = useState(false);
  const [balanceInput, setBalanceInput] = useState("");
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [rulesSheet, setRulesSheet] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [coolingInput, setCoolingInput] = useState("");
  const [rulesErrors, setRulesErrors] = useState<{ goal?: string; cooling?: string }>({});

  const load = useCallback(async () => {
    const s = await refreshWishlist(db);
    setState(s);
    return s;
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const open = (id: number | "new") => router.push({ pathname: "/plus/wishlist/[id]", params: { id: String(id) } });
  const header = <IconButton icon="add" label="Ajouter une envie" onPress={() => open("new")} />;

  if (!state) {
    return (
      <Screen back title="Wishlist" subtitle="Envies et épargne" domain="epargne" right={header}>
        <SkeletonCard />
      </Screen>
    );
  }

  const day = today();
  const month = monthOf(day);
  const goal = state.settings.monthlyGoalCents;
  const wanted = state.items.filter((i) => i.status === "wanted");
  const categories = [...new Set(wanted.map((i) => i.category))];
  const shown = wanted.filter((i) => category === "all" || i.category === category);
  const target = fundingOrder(wanted)[0];
  const funding = target ? state.plan.get(target.id) : undefined;
  const tracking = tracksSavings(state);
  const saved = monthlySaved(state.balances).slice(-6);
  const closedItems = state.items.filter((i) => i.status === closed);

  const recordBalance = async (cents: number, message: string) => {
    const previous = state.balances.find((b) => b.month === month)?.balanceCents ?? null;
    await saveBalance(db, month, cents);
    haptics.success();
    load();
    snackbar.show({
      message,
      undo: async () => {
        if (previous === null) await db.runAsync("DELETE FROM savings_balances WHERE month = ?", month);
        else await saveBalance(db, month, previous);
        load();
      },
      redo: async () => {
        await saveBalance(db, month, cents);
        load();
      },
    });
  };

  const submitBalance = async () => {
    const cents = parseEuros(balanceInput);
    if (cents === null) {
      haptics.warning();
      setBalanceError("Montant en euros, par exemple 1250.");
      return;
    }
    setBalanceSheet(false);
    setBalanceInput("");
    await recordBalance(cents, `Solde de ${monthName(month)} : ${formatCents(cents, true)}`);
  };

  const saveRules = async () => {
    const goalCents = goalInput.trim() ? parseEuros(goalInput) : 0;
    const days = Number(coolingInput);
    const errors = {
      goal: goalCents === null ? "Montant en euros, par exemple 200." : undefined,
      cooling: !Number.isInteger(days) || days < 0 || days > 365 ? "Entre 0 et 365 jours." : undefined,
    };
    setRulesErrors(errors);
    if (goalCents === null || errors.cooling) {
      haptics.warning();
      return;
    }
    await saveWishlistSettings(db, { monthlyGoalCents: goalCents, coolingDays: days });
    haptics.success();
    setRulesSheet(false);
    load();
  };

  return (
    <Screen back title="Wishlist" subtitle="Envies et épargne" domain="epargne" right={header}>
      {categories.length > 1 ? (
        <Chips scroll value={category} onChange={setCategory} options={[{ value: "all", label: "Tout" }, ...categories.map((c) => ({ value: c, label: c }))]} />
      ) : null}

      {target ? (
        <Card index={0}>
          <View style={{ gap: 2 }}>
            <Txt variant="overline" tone="accent">
              Objectif d'épargne
            </Txt>
            <Txt variant="headline">{target.name}</Txt>
            <Txt variant="caption" tone="muted">
              {target.category} · {PRIORITY_LABEL[target.priority].toLowerCase()}
            </Txt>
          </View>
          {tracking && funding ? (
            <>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Txt variant="callout">Épargné</Txt>
                <Txt variant="label" style={{ fontVariant: ["tabular-nums"] }}>
                  {formatCents(funding.fundedCents, true)} / {formatCents(target.priceCents, true)}
                </Txt>
              </View>
              <ProgressBar value={funding.fundedCents / target.priceCents} label="Part épargnée" />
              <Txt variant="caption" tone="muted">
                {goal ? `${formatCents(goal, true)} / mois · ` : ""}
                {funding.monthsToGo === 0 ? "finançable maintenant" : funding.monthsToGo === null ? "fixe une épargne mensuelle" : `atteint vers ${monthsAhead(day, funding.monthsToGo)}`}
              </Txt>
            </>
          ) : (
            <Notice tone="info">Saisis ton solde d'épargne pour savoir quand tu pourras t'offrir chaque envie.</Notice>
          )}
          {!state.monthRecorded && goal > 0 && state.balanceCents !== null ? (
            <Button
              variant="soft"
              icon="add"
              label={`Ajouter les ${formatCents(goal, true)} de ${monthName(month)}`}
              onPress={() => recordBalance(state.balanceCents! + goal, `${formatCents(goal, true)} ajoutés · solde ${formatCents(state.balanceCents! + goal, true)}`)}
            />
          ) : null}
          <Button
            variant={state.balanceCents === null ? "soft" : "ghost"}
            label={state.monthRecorded ? `Corriger le solde de ${monthName(month)}` : "Saisir le solde exact"}
            onPress={() => {
              setBalanceInput(state.balanceCents !== null ? centsToInput(state.balanceCents) : "");
              setBalanceError(null);
              setBalanceSheet(true);
            }}
          />
        </Card>
      ) : null}

      {wanted.length === 0 ? (
        <EmptyState
          icon="gift-outline"
          title="Aucune envie"
          body="Ajoute ce qui te fait envie : la période de réflexion et l'épargne feront le tri."
          action={{ label: "Ajouter une envie", onPress: () => open("new") }}
        />
      ) : (
        (category === "all" ? categories : [category]).map((c, i) => {
          const items = shown.filter((it) => it.category === c);
          if (!items.length) return null;
          return (
            <View key={c} style={{ gap: space.md }}>
              <SectionTitle right={`${items.length} envie${items.length > 1 ? "s" : ""}`}>{c}</SectionTitle>
              <Card index={i + 1} style={{ gap: 0 }}>
                {items.map((item) => (
                  <WishRow key={item.id} item={item} onPress={() => open(item.id)} />
                ))}
              </Card>
            </View>
          );
        })
      )}
      {wanted.length ? (
        <Txt variant="caption" tone="muted" style={{ paddingHorizontal: space.xs }}>
          {wanted.length} envie{wanted.length > 1 ? "s" : ""} · {formatCents(sum(wanted.map((i) => i.priceCents)), true)} au total
        </Txt>
      ) : null}

      {state.items.length ? (
        <>
          <SectionTitle>Bilan</SectionTitle>
          <Card>
            <StatGrid>
              <Stat
                label="Finançables"
                value={tracking ? String(wanted.filter((i) => state.plan.get(i.id)?.monthsToGo === 0).length) : "—"}
                hint="avec l'épargne actuelle"
              />
              <Stat
                label="Économisé"
                value={formatCents(sum(state.items.filter((i) => i.status === "dropped").map((i) => i.priceCents)), true)}
                hint="envies abandonnées"
                color="sante"
              />
              <Stat label="Dépensé" value={formatCents(sum(state.items.filter((i) => i.status === "bought").map((i) => i.paidCents ?? i.priceCents)), true)} />
              <Stat
                label="Solde"
                value={state.balanceCents === null ? "—" : formatCents(state.balanceCents, true)}
                hint={state.balances.length ? `saisi en ${monthName(state.balances[state.balances.length - 1].month)}` : undefined}
              />
            </StatGrid>
            {saved.length >= 2 ? (
              <MiniBars
                data={saved.map((m) => ({ label: monthName(m.month, "short"), value: m.savedCents }))}
                goal={goal || undefined}
                color={t.domain.epargne.accent}
                reachedColor={t.domain.sante.accent}
              />
            ) : null}
          </Card>

          <Segmented
            value={closed}
            onChange={setClosed}
            options={[
              { value: "bought", label: "Achetées" },
              { value: "dropped", label: "Abandonnées" },
            ]}
          />
          {closedItems.length ? (
            <Card style={{ gap: 0 }}>
              {closedItems.map((item) => (
                <ListRow
                  key={item.id}
                  title={item.name}
                  subtitle={
                    item.status === "bought"
                      ? `Acheté le ${item.closedOn ? formatFrDate(item.closedOn) : "?"}`
                      : `Abandonné le ${item.closedOn ? formatFrDate(item.closedOn) : "?"} · économisé`
                  }
                  right={formatCents(item.paidCents ?? item.priceCents, true)}
                  onPress={() => open(item.id)}
                />
              ))}
            </Card>
          ) : (
            <Txt variant="caption" tone="muted" style={{ paddingHorizontal: space.xs }}>
              {closed === "bought" ? "Rien d'acheté pour l'instant." : "Rien d'abandonné pour l'instant."}
            </Txt>
          )}
        </>
      ) : null}

      <Card style={{ gap: 0 }}>
        <ListRow
          icon="options-outline"
          title="Règles"
          subtitle={`${goal ? `${formatCents(goal, true)} / mois` : "pas d'épargne mensuelle"} · réflexion ${state.settings.coolingDays ? `${state.settings.coolingDays} j` : "désactivée"}`}
          onPress={() => {
            setGoalInput(goal ? centsToInput(goal) : "");
            setCoolingInput(String(state.settings.coolingDays));
            setRulesErrors({});
            setRulesSheet(true);
          }}
        />
      </Card>

      <Sheet visible={balanceSheet} onClose={() => setBalanceSheet(false)} title={`Solde de ${monthName(month)}`} subtitle="Le montant total de ton épargne, à la main">
        <View style={{ gap: space.md }}>
          <Field
            label="Solde (€)"
            value={balanceInput}
            onChangeText={(v) => {
              setBalanceInput(v);
              setBalanceError(null);
            }}
            keyboardType="decimal-pad"
            error={balanceError}
            placeholder="1250"
          />
          <View style={{ flexDirection: "row", gap: space.md }}>
            <Button label="Annuler" variant="outline" style={{ flex: 1 }} onPress={() => setBalanceSheet(false)} />
            <Button label="Enregistrer" style={{ flex: 1 }} onPress={submitBalance} />
          </View>
        </View>
      </Sheet>

      <Sheet visible={rulesSheet} onClose={() => setRulesSheet(false)} title="Règles">
        <View style={{ gap: space.md }}>
          <Field
            label="Épargne visée par mois (€)"
            value={goalInput}
            onChangeText={(v) => (setGoalInput(v), setRulesErrors({ ...rulesErrors, goal: undefined }))}
            keyboardType="decimal-pad"
            placeholder="200"
            error={rulesErrors.goal}
          />
          <Field
            label="Réflexion avant achat (jours)"
            value={coolingInput}
            onChangeText={(v) => (setCoolingInput(v), setRulesErrors({ ...rulesErrors, cooling: undefined }))}
            keyboardType="number-pad"
            helper="0 = désactivée. S'applique aux nouvelles envies."
            error={rulesErrors.cooling}
          />
          <View style={{ flexDirection: "row", gap: space.md }}>
            <Button label="Annuler" variant="outline" style={{ flex: 1 }} onPress={() => setRulesSheet(false)} />
            <Button label="Enregistrer" style={{ flex: 1 }} onPress={saveRules} />
          </View>
        </View>
      </Sheet>
    </Screen>
  );
}

function WishRow({ item, onPress }: { item: WishItem; onPress: () => void }) {
  const cooling = coolingLeft(item);
  return (
    <ListRow
      title={item.name}
      subtitle={`${item.category} · ${PRIORITY_LABEL[item.priority].toLowerCase()}`}
      right={
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Txt variant="bodyStrong" style={{ fontVariant: ["tabular-nums"] }}>
            {formatCents(item.priceCents, item.priceCents >= 10000 || item.priceCents % 100 === 0)}
          </Txt>
          {cooling > 0 ? <Badge color="warning" icon="hourglass-outline" label={`${cooling} j`} /> : null}
        </View>
      }
      onPress={onPress}
    />
  );
}
