import { useCallback, useState } from "react";
import { Alert, View } from "react-native";
import Animated from "react-native-reanimated";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  IconTile,
  layoutTransition,
  Notice,
  PressableScale,
  Screen,
  SectionTitle,
  space,
  StackedBar,
  Stat,
  StatGrid,
  Swipeable,
  tint,
  Txt,
  useActionSheet,
  useSnackbar,
  useTheme,
  type MenuAction,
} from "@/components/ui";
import { CATEGORY_STYLE } from "@/components/subscriptionMeta";
import { shortFrDate } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
import { formatCents } from "@/lib/money";
import { cycleLabel } from "@/lib/renewals";
import {
  CATEGORY_LABEL,
  cancellationUrl,
  deleteSubscription,
  openCancellation,
  refreshSubscriptions,
  setSubscriptionStatus,
  subscriptionAlerts,
  type SubscriptionCategory,
  type SubscriptionState,
} from "@/lib/subscriptions";

const when = (days: number) => (days === 0 ? "Aujourd'hui" : days === 1 ? "Demain" : `Dans ${days} j`);

export default function SubscriptionsScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const [subs, setSubs] = useState<SubscriptionState[]>([]);
  const [showCancelled, setShowCancelled] = useState(false);

  const load = useCallback(async () => setSubs(await refreshSubscriptions(db)), [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const active = subs.filter((s) => s.status === "active");
  const cancelled = subs.filter((s) => s.status === "cancelled");
  const monthly = active.reduce((sum, s) => sum + s.monthlyCents, 0);
  const next30 = active.filter((s) => s.daysUntil <= 30).reduce((sum, s) => sum + s.priceCents, 0);
  const byCategory = Object.entries(
    active.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.category]: (acc[s.category] ?? 0) + s.monthlyCents }), {}),
  )
    .map(([category, cents]) => ({ category: category as SubscriptionCategory, cents }))
    .sort((a, b) => b.cents - a.cents);
  const alerts = subscriptionAlerts(subs);
  const open = (id: number | "new") => router.push({ pathname: "/plus/abonnements/[id]", params: { id: String(id) } });
  const snackbar = useSnackbar();
  const actions = useActionSheet();

  /** Résilié / réactivé, with undo. */
  const setStatus = async (s: SubscriptionState, status: "active" | "cancelled") => {
    haptics.success();
    await setSubscriptionStatus(db, s.id, status);
    await load();
    snackbar.show({
      message: `${s.name} : ${status === "cancelled" ? "noté résilié" : "réactivé"}`,
      undo: async () => {
        await setSubscriptionStatus(db, s.id, s.status === "cancelled" ? "cancelled" : "active");
        await load();
      },
    });
  };

  const swipe = (s: SubscriptionState) =>
    s.status === "cancelled"
      ? { icon: "refresh-outline" as const, label: "Réactiver", onAction: () => setStatus(s, "active") }
      : { icon: "close-circle-outline" as const, label: "Résilié", danger: true, onAction: () => setStatus(s, "cancelled") };

  const menu = (s: SubscriptionState) => {
    const list: MenuAction[] = [
      { icon: "create-outline", label: "Modifier", onPress: () => open(s.id) },
      ...(s.status !== "cancelled" && cancellationUrl(s)
        ? [{ icon: "open-outline" as const, label: "Page de résiliation", hint: s.billing === "google_play" ? "Google Play" : undefined, onPress: () => openCancellation(s) }]
        : []),
      s.status === "cancelled"
        ? { icon: "refresh-outline", label: "Réactiver", onPress: () => setStatus(s, "active") }
        : { icon: "close-circle-outline", label: "Noter résilié", hint: "Plus de rappel ni de budget", onPress: () => setStatus(s, "cancelled") },
      {
        icon: "trash-outline",
        label: "Supprimer",
        danger: true,
        onPress: () =>
          Alert.alert(`Supprimer « ${s.name} » ?`, "Il disparaît du budget et de l'historique.", [
            { text: "Annuler", style: "cancel" },
            {
              text: "Supprimer",
              style: "destructive",
              onPress: async () => {
                await deleteSubscription(db, s.id);
                load();
              },
            },
          ]),
      },
    ];
    actions.open(s.name, list);
  };

  return (
    <Screen back domain="epargne" title="Abonnements" subtitle="Ce que tu paies chaque mois, et quand">
      {active.length ? (
        <Card title="Budget" icon="card" color="epargne" index={0}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.xs }}>
            <Txt variant="number">{formatCents(Math.round(monthly))}</Txt>
            <Txt variant="callout" tone="muted">
              / mois
            </Txt>
          </View>
          <StatGrid>
            <Stat label="Par an" value={formatCents(Math.round(monthly * 12), true)} />
            <Stat label="Sur 30 jours" value={formatCents(next30, true)} hint={`${active.length} abonnement${active.length > 1 ? "s" : ""} actif${active.length > 1 ? "s" : ""}`} />
          </StatGrid>
          <StackedBar
            label="Répartition mensuelle par catégorie"
            segments={byCategory.map((c) => ({ value: c.cents, color: tint(t, CATEGORY_STYLE[c.category].color).solid }))}
          />
          <View style={{ gap: space.sm }}>
            {byCategory.map((c) => (
              <View key={c.category} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: tint(t, CATEGORY_STYLE[c.category].color).solid }} />
                <Txt variant="callout" style={{ flex: 1 }}>
                  {CATEGORY_LABEL[c.category]}
                </Txt>
                <Txt variant="callout" tone="muted">
                  {formatCents(Math.round(c.cents))} · {Math.round((c.cents / monthly) * 100)} %
                </Txt>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {alerts.map((a) => (
        <Notice key={a.key} tone={a.tone}>
          {a.text}
        </Notice>
      ))}

      <Card title="Prochains prélèvements" icon="calendar" color="epargne" index={1}>
        {active.length === 0 ? (
          <EmptyState icon="card-outline" title="Aucun abonnement" body="Ajoute tes abonnements pour voir ton budget mensuel et être prévenu avant chaque prélèvement." />
        ) : (
          active.map((s) => (
            <Swipeable key={s.id} style={{ marginHorizontal: -space.sm }} right={swipe(s)}>
              <SubscriptionRow sub={s} onPress={() => open(s.id)} onLongPress={() => menu(s)} />
            </Swipeable>
          ))
        )}
      </Card>

      {cancelled.length ? (
        <View style={{ gap: space.sm }}>
          <PressableScale
            accessibilityRole="button"
            accessibilityState={{ expanded: showCancelled }}
            onPress={() => setShowCancelled(!showCancelled)}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}
          >
            <SectionTitle>{`Résiliés (${cancelled.length})`}</SectionTitle>
            <Icon name={showCancelled ? "chevron-up" : "chevron-down"} size={18} color={t.textMuted} />
          </PressableScale>
          {showCancelled ? (
            <Card index={0}>
              {cancelled.map((s) => (
                <Swipeable key={s.id} style={{ marginHorizontal: -space.sm }} left={swipe(s)}>
                  <SubscriptionRow sub={s} onPress={() => open(s.id)} onLongPress={() => menu(s)} />
                </Swipeable>
              ))}
            </Card>
          ) : null}
        </View>
      ) : null}

      <Button label="Ajouter un abonnement" icon="add" variant="soft" onPress={() => open("new")} />
      {actions.sheet}
    </Screen>
  );
}

function SubscriptionRow({ sub, onPress, onLongPress }: { sub: SubscriptionState; onPress: () => void; onLongPress: () => void }) {
  const style = CATEGORY_STYLE[sub.category];
  const cancelled = sub.status === "cancelled";
  return (
    <Animated.View layout={layoutTransition}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${sub.name}, ${formatCents(sub.priceCents)} ${cycleLabel(sub.cycle)}`}
        accessibilityHint="Appui long pour plus d'actions"
        onPress={onPress}
        onLongPress={onLongPress}
        style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56, paddingHorizontal: space.sm, opacity: cancelled ? 0.6 : 1 }}
      >
        <IconTile icon={style.icon} color={style.color} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>
            {sub.name}
          </Txt>
          <Txt variant="caption" tone="muted">
            {cancelled
              ? `Résilié${sub.cancelledOn ? ` le ${shortFrDate(sub.cancelledOn)}` : ""}`
              : `${when(sub.daysUntil)} · ${shortFrDate(sub.nextOn)}`}
          </Txt>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Txt variant="bodyStrong">{formatCents(sub.priceCents)}</Txt>
          {sub.trialDaysLeft !== null && !cancelled ? (
            <Badge label={`Essai · ${sub.trialDaysLeft} j`} color="warning" />
          ) : (
            <Txt variant="caption" tone="muted">
              {cycleLabel(sub.cycle)}
            </Txt>
          )}
        </View>
      </PressableScale>
    </Animated.View>
  );
}
