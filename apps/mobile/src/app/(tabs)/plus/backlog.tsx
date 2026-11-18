import { useCallback, useState } from "react";
import { Linking, View } from "react-native";
import Animated from "react-native-reanimated";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import type { BacklogItem, BacklogStatus } from "@ld/contracts";
import {
  Badge,
  Button,
  Card,
  Chips,
  EmptyState,
  Icon,
  IconButton,
  layoutTransition,
  Notice,
  PressableScale,
  Screen,
  SectionTitle,
  space,
  Txt,
  useTheme,
} from "@/components/ui";
import { changeStatus, dropPending, loadBacklog, moduleLabel, syncBacklog, type BacklogState, type PendingChange } from "@/lib/backlog";
import { haptics } from "@/lib/haptics";

const SECTIONS: { status: BacklogStatus; title: string }[] = [
  { status: "doing", title: "En cours" },
  { status: "todo", title: "À faire" },
  { status: "done", title: "Fait" },
];

/** The one-tap move for each status. */
const NEXT: Record<BacklogStatus, { status: BacklogStatus; label: string }> = {
  todo: { status: "doing", label: "Commencer" },
  doing: { status: "done", label: "Terminer" },
  done: { status: "todo", label: "Rouvrir" },
};

const syncedLabel = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Backlog by status, filtered by module; opens the issue on GitHub, moves it in one tap. Works offline. */
export default function BacklogScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const [state, setState] = useState<BacklogState | null>(null);
  const [module, setModule] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const sync = useCallback(async () => setState(await syncBacklog(db)), [db]);

  useFocusEffect(
    useCallback(() => {
      // Cache first (instant, offline), then the network.
      loadBacklog(db).then(setState);
      sync();
    }, [db, sync]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await sync();
    setRefreshing(false);
  };

  const move = async (item: BacklogItem, status: BacklogStatus) => {
    haptics.tap();
    await changeStatus(db, item, status);
    setState(await loadBacklog(db));
  };

  const drop = async (change: PendingChange) => {
    await dropPending(db, change.outboxId);
    setState(await loadBacklog(db));
  };

  const capture = () => router.push({ pathname: "/capture", params: { from: "/modules/backlog" } });

  if (!state) return <Screen back title="Backlog" />;

  const modules = [...new Set(state.items.map((i) => i.module).filter((m): m is string => !!m))];
  const shown = state.items.filter((i) => module === "all" || i.module === module);

  return (
    <Screen
      back
      title="Backlog"
      subtitle={state.syncedAt ? `Synchronisé le ${syncedLabel(state.syncedAt)}` : "Idées et bugs, suivis sur GitHub"}
      right={<IconButton icon="add" variant="soft" label="Noter une idée ou un bug" onPress={capture} />}
      refreshing={refreshing}
      onRefresh={state.configured ? refresh : undefined}
    >
      {!state.configured ? (
        <Card index={0}>
          <EmptyState icon="git-branch-outline" title="Backlog non relié" body="Renseigne le dépôt GitHub et un jeton limité à ce dépôt dans Réglages." />
          <Button label="Ouvrir Réglages" icon="settings-outline" variant="soft" onPress={() => router.navigate("/reglages")} />
        </Card>
      ) : null}

      {state.offline ? <Notice tone="info">Hors ligne : affichage de la dernière copie. Les changements partiront au retour du réseau.</Notice> : null}
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}

      {state.pending.length ? (
        <Card title="En attente d'envoi" icon="cloud-upload-outline" color="warning" index={0}>
          {state.pending.map((p) => (
            <View key={p.outboxId} style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 48 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="bodyStrong" numberOfLines={2}>
                  {p.kind === "create" ? p.payload.title : p.kind === "status" ? `${p.payload.title} → ${SECTIONS.find((s) => s.status === p.payload.status)?.title}` : "Commentaire"}
                </Txt>
                <Txt variant="caption" tone={p.error ? "danger" : "muted"}>
                  {p.error ?? (p.kind === "create" ? "Nouvelle issue" : "Changement de statut")}
                </Txt>
              </View>
              <IconButton icon="trash-outline" variant="ghost" label="Abandonner ce changement" onPress={() => drop(p)} />
            </View>
          ))}
        </Card>
      ) : null}

      {modules.length > 1 ? (
        <Chips value={module} onChange={setModule} options={[{ value: "all", label: "Tout" }, ...modules.map((m) => ({ value: m, label: moduleLabel(m) }))]} />
      ) : null}

      {state.configured && shown.length === 0 && !state.pending.length ? (
        <Card index={1}>
          <EmptyState icon="checkmark-done-outline" title="Rien ici" body="Note une idée ou un bug avec le bouton +, ou depuis Aujourd'hui." />
        </Card>
      ) : null}

      {SECTIONS.map(({ status, title }) => {
        const items = shown.filter((i) => i.status === status);
        if (!items.length) return null;
        const collapsed = status === "done" && !showDone;
        return (
          <View key={status} style={{ gap: space.sm }}>
            {status === "done" ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityState={{ expanded: showDone }}
                onPress={() => setShowDone(!showDone)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}
              >
                <SectionTitle>{`${title} (${items.length})`}</SectionTitle>
                <Icon name={showDone ? "chevron-up" : "chevron-down"} size={18} color={t.textMuted} />
              </PressableScale>
            ) : (
              <SectionTitle>{`${title} (${items.length})`}</SectionTitle>
            )}
            {collapsed ? null : (
              <Card index={1}>
                {items.map((item) => (
                  <BacklogRow key={item.id} item={item} onMove={move} />
                ))}
              </Card>
            )}
          </View>
        );
      })}
    </Screen>
  );
}

function BacklogRow({ item, onMove }: { item: BacklogItem; onMove: (item: BacklogItem, status: BacklogStatus) => void }) {
  const next = NEXT[item.status];
  return (
    <Animated.View layout={layoutTransition} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <PressableScale
        accessibilityRole="link"
        accessibilityLabel={`${item.title}, ouvrir sur GitHub`}
        onPress={() => Linking.openURL(item.url)}
        style={{ flex: 1, gap: 6, minHeight: 56, justifyContent: "center", paddingVertical: space.xs }}
      >
        <Txt variant="bodyStrong" numberOfLines={2}>
          {item.title}
        </Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Txt variant="caption" tone="muted">
            #{item.id}
          </Txt>
          {item.kind === "bug" ? <Badge label="Bug" color="danger" /> : item.kind === "idea" ? <Badge label="Idée" color="encre" /> : null}
          {item.module ? <Badge label={moduleLabel(item.module)} color="encre" /> : null}
        </View>
      </PressableScale>
      <Button size="sm" variant={item.status === "done" ? "ghost" : "soft"} label={next.label} onPress={() => onMove(item, next.status)} />
    </Animated.View>
  );
}
