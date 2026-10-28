import { useCallback, useState } from "react";
import { Linking, View } from "react-native";
import Animated from "react-native-reanimated";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  Badge,
  Button,
  Card,
  Chips,
  EmptyState,
  entering,
  Field,
  Icon,
  IconButton,
  IconTile,
  layoutTransition,
  MiniBars,
  Notice,
  PressableScale,
  ProgressBar,
  radius,
  Screen,
  Segmented,
  space,
  Stat,
  StatGrid,
  Txt,
  useTheme,
  elevation,
  type Tint,
} from "@/components/ui";
import { atLocalTime, diffDays, formatFrDate, today } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
import { centsToInput, formatCents, parseEuros } from "@/lib/money";
import { monthlySaved, monthOf, type Priority } from "@/lib/savings";
import {
  coolingLeft,
  PRIORITY_LABEL,
  refreshWishlist,
  saveBalance,
  saveWishlistSettings,
  tracksSavings,
  type WishItem,
  type WishlistState,
  type WishStatus,
} from "@/lib/wishlist";

const PRIORITY_COLOR: Record<Priority, Tint> = { 1: "settings", 2: "primary", 3: "danger" };

const monthName = (month: string, style: "long" | "short" = "long") =>
  atLocalTime(`${month}-15`, 12).toLocaleDateString("fr-FR", { month: style });

export default function WishlistScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const [state, setState] = useState<WishlistState | null>(null);
  const [status, setStatus] = useState<WishStatus>("wanted");
  const [category, setCategory] = useState("all");
  const [balanceInput, setBalanceInput] = useState("");
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [editingBalance, setEditingBalance] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [coolingInput, setCoolingInput] = useState("");
  const [rulesSaved, setRulesSaved] = useState(false);
  const [rulesErrors, setRulesErrors] = useState<{ goal?: string; cooling?: string }>({});

  const load = useCallback(async () => {
    const s = await refreshWishlist(db);
    setState(s);
    return s;
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load().then((s) => {
        setGoalInput(s.settings.monthlyGoalCents ? centsToInput(s.settings.monthlyGoalCents) : "");
        setCoolingInput(String(s.settings.coolingDays));
      });
    }, [load]),
  );

  if (!state) return <Screen back title="Wishlist" />;

  const day = today();
  const month = monthOf(day);
  const goal = state.settings.monthlyGoalCents;
  const wanted = state.items.filter((i) => i.status === "wanted");
  const shown = state.items.filter((i) => i.status === status && (category === "all" || i.category === category));
  const usedCategories = [...new Set(state.items.filter((i) => i.status === status).map((i) => i.category))];
  const saved = monthlySaved(state.balances).slice(-6);
  const tracking = tracksSavings(state);

  const recordBalance = async () => {
    const cents = parseEuros(balanceInput);
    if (cents === null) {
      setBalanceError("Montant en euros, par exemple 1250.");
      return;
    }
    await saveBalance(db, month, cents);
    haptics.success();
    setBalanceInput("");
    setEditingBalance(false);
    load();
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
    setRulesSaved(true);
    load();
  };

  const open = (id: number | "new") => router.push({ pathname: "/modules/wishlist/[id]", params: { id: String(id) } });

  return (
    <Screen back title="Wishlist" subtitle="Envies, épargne et temps de réflexion">
      <Card title="Épargne" icon="wallet" color="wish" index={0}>
        {state.balanceCents === null ? (
          <Notice tone="info">Saisis ton solde d'épargne pour savoir quand tu pourras t'offrir chaque envie.</Notice>
        ) : (
          <View style={{ gap: 2 }}>
            <Txt variant="number">{formatCents(state.balanceCents, true)}</Txt>
            <Txt variant="caption" tone="muted">
              Solde de {monthName(state.balances[state.balances.length - 1].month)}
            </Txt>
          </View>
        )}

        {goal > 0 ? (
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Txt variant="callout">Ce mois-ci</Txt>
              <Txt variant="callout" tone="muted">
                {state.savedThisMonthCents === null ? "—" : formatCents(state.savedThisMonthCents, true)} / {formatCents(goal, true)}
              </Txt>
            </View>
            <ProgressBar
              value={(state.savedThisMonthCents ?? 0) / goal}
              color={(state.savedThisMonthCents ?? 0) >= goal ? t.success : t.module.wish.solid}
              label="Objectif d'épargne du mois"
            />
          </View>
        ) : null}

        {saved.length >= 2 ? (
          <MiniBars
            data={saved.map((m) => ({ label: monthName(m.month, "short"), value: m.savedCents }))}
            goal={goal || undefined}
            color={t.module.wish.solid}
            reachedColor={t.success}
          />
        ) : null}

        {!state.monthRecorded || editingBalance ? (
          <View style={{ gap: space.sm }}>
            <Field
              label={`Solde de ${monthName(month)} (€)`}
              value={balanceInput}
              onChangeText={(v) => {
                setBalanceInput(v);
                setBalanceError(null);
              }}
              keyboardType="decimal-pad"
              error={balanceError}
              placeholder={state.balanceCents !== null ? centsToInput(state.balanceCents) : "1250"}
            />
            <Button label="Enregistrer le solde" icon="checkmark" onPress={recordBalance} />
          </View>
        ) : (
          <Button size="sm" variant="secondary" icon="create-outline" label={`Corriger le solde de ${monthName(month)}`} onPress={() => setEditingBalance(true)} />
        )}
      </Card>

      {state.items.length ? (
        <Card title="Bilan" icon="stats-chart" color="wish" index={1}>
          <StatGrid>
            <Stat label="Envies en cours" value={formatCents(sum(wanted.map((i) => i.priceCents)), true)} hint={`${wanted.length} envie${wanted.length > 1 ? "s" : ""}`} />
            <Stat
              label="Finançables"
              value={tracking ? String(wanted.filter((i) => state.plan.get(i.id)?.monthsToGo === 0).length) : "—"}
              hint="avec l'épargne actuelle"
            />
            <Stat
              label="Économisé"
              value={formatCents(sum(state.items.filter((i) => i.status === "dropped").map((i) => i.priceCents)), true)}
              hint="envies abandonnées"
              color="success"
            />
            <Stat label="Dépensé" value={formatCents(sum(state.items.filter((i) => i.status === "bought").map((i) => i.paidCents ?? i.priceCents)), true)} />
          </StatGrid>
        </Card>
      ) : null}

      <Segmented
        value={status}
        onChange={(v) => {
          setStatus(v);
          setCategory("all");
        }}
        options={[
          { value: "wanted", label: `Envies (${wanted.length})` },
          { value: "bought", label: "Achetées" },
          { value: "dropped", label: "Abandonnées" },
        ]}
      />
      {usedCategories.length > 1 ? (
        <Chips
          value={category}
          onChange={setCategory}
          options={[{ value: "all", label: "Tout" }, ...usedCategories.map((c) => ({ value: c, label: c }))]}
        />
      ) : null}

      {shown.length === 0 ? (
        <Card index={2}>
          <EmptyState
            icon="gift-outline"
            title={status === "wanted" ? "Aucune envie" : status === "bought" ? "Rien d'acheté" : "Rien d'abandonné"}
            body={status === "wanted" ? "Ajoute ce qui te fait envie : la période de réflexion et l'épargne feront le tri." : undefined}
          />
        </Card>
      ) : (
        shown.map((item, i) => (
          <WishRow key={item.id} item={item} index={i + 2} funding={state.plan.get(item.id)} tracking={tracking} onPress={() => open(item.id)} />
        ))
      )}

      <Button label="Ajouter une envie" icon="add" variant="soft" onPress={() => open("new")} />

      <Card title="Règles" icon="options-outline" color="settings" index={3}>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field
              label="Épargne visée / mois (€)"
              value={goalInput}
              onChangeText={(v) => (setGoalInput(v), setRulesSaved(false), setRulesErrors({ ...rulesErrors, goal: undefined }))}
              keyboardType="decimal-pad"
              placeholder="200"
              error={rulesErrors.goal}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Réflexion (jours)"
              value={coolingInput}
              onChangeText={(v) => (setCoolingInput(v), setRulesSaved(false), setRulesErrors({ ...rulesErrors, cooling: undefined }))}
              keyboardType="number-pad"
              helper="0 = désactivée"
              error={rulesErrors.cooling}
            />
          </View>
        </View>
        <Button size="sm" variant="secondary" icon="save-outline" label={rulesSaved ? "Enregistré" : "Enregistrer les règles"} onPress={saveRules} />
      </Card>
    </Screen>
  );
}

function WishRow({
  item,
  index,
  funding,
  tracking,
  onPress,
}: {
  item: WishItem;
  index: number;
  funding?: { fundedCents: number; monthsToGo: number | null };
  tracking: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const cooling = coolingLeft(item);
  const coolingTotal = item.coolingUntil ? Math.max(1, diffDays(item.addedOn, item.coolingUntil)) : 1;

  return (
    <Animated.View entering={entering(index)} layout={layoutTransition}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${formatCents(item.priceCents)}`}
        onPress={onPress}
        style={[
          { backgroundColor: t.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md, borderWidth: t.dark ? 1 : 0, borderColor: t.border },
          elevation(t),
        ]}
      >
        <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
          <IconTile icon="gift-outline" color="wish" />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="bodyStrong" numberOfLines={2}>
              {item.name}
            </Txt>
            <Txt variant="caption" tone="muted">
              {item.category}
              {item.status === "wanted" ? ` · ajouté le ${formatFrDate(item.addedOn)}` : ""}
            </Txt>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Txt variant="bodyStrong">{formatCents(item.priceCents, item.priceCents >= 10000)}</Txt>
            {item.status === "wanted" ? <Badge label={PRIORITY_LABEL[item.priority]} color={PRIORITY_COLOR[item.priority]} /> : null}
          </View>
          {item.url ? (
            <IconButton icon="open-outline" variant="soft" label={`Ouvrir le lien de ${item.name}`} onPress={() => Linking.openURL(item.url!)} />
          ) : null}
        </View>

        {item.status === "wanted" ? (
          <>
            {cooling > 0 ? (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Icon name="hourglass-outline" size={16} color={t.warning} />
                  <Txt variant="caption" tone="warning">
                    Réflexion : encore {cooling} j
                  </Txt>
                </View>
                <ProgressBar value={1 - cooling / coolingTotal} color={t.warning} height={6} label="Période de réflexion" />
              </View>
            ) : null}
            {tracking && funding ? (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  {funding.monthsToGo === 0 ? (
                    <Badge label="Finançable" icon="checkmark-circle" color="success" />
                  ) : funding.monthsToGo === null ? (
                    <Badge label="Objectif mensuel à définir" color="settings" />
                  ) : (
                    <Badge label={`≈ ${funding.monthsToGo} mois d'épargne`} icon="time-outline" color="wish" />
                  )}
                  <Txt variant="caption" tone="muted">
                    {formatCents(funding.fundedCents, true)} couverts
                  </Txt>
                </View>
                <ProgressBar value={funding.fundedCents / item.priceCents} color={t.module.wish.solid} height={6} label="Part financée" />
              </View>
            ) : null}
          </>
        ) : (
          <Txt variant="caption" tone={item.status === "dropped" ? "success" : "muted"}>
            {item.status === "bought"
              ? `Acheté le ${item.closedOn ? formatFrDate(item.closedOn) : "?"} · ${formatCents(item.paidCents ?? item.priceCents)}`
              : `Abandonné le ${item.closedOn ? formatFrDate(item.closedOn) : "?"} · ${formatCents(item.priceCents)} économisés`}
          </Txt>
        )}

      </PressableScale>
    </Animated.View>
  );
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
