import { useEffect, useState } from "react";
import { View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import { Button, Card, Field, Notice, Screen, Segmented, space } from "@/components/ui";
import { api, getApiConfig, setApiConfig } from "@/lib/api";
import { loadThemePreference, saveThemePreference, type ThemePreference } from "@/lib/appearance";
import { getBacklogConfig, saveBacklogConfig, syncBacklog } from "@/lib/backlog";
import { parseRepo } from "@/lib/backlogGithub";
import { haptics } from "@/lib/haptics";
import { notificationsAvailable, scheduleDaily } from "@/lib/notifications";

type Status = { tone: "success" | "warning" | "danger"; text: string } | null;

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [baseUrl, setBaseUrl] = useState("");
  const [appKey, setAppKey] = useState("");
  const [goal, setGoal] = useState("2000");
  const [glass, setGlass] = useState("250");
  const [backendStatus, setBackendStatus] = useState<Status>(null);
  const [hydrationStatus, setHydrationStatus] = useState<Status>(null);
  const [hydrationErrors, setHydrationErrors] = useState<{ goal?: string; glass?: string }>({});
  const [reminderStatus, setReminderStatus] = useState<Status>(null);
  const [testing, setTesting] = useState(false);
  const [backlogRepo, setBacklogRepo] = useState("");
  const [backlogToken, setBacklogToken] = useState("");
  const [backlogHasToken, setBacklogHasToken] = useState(false);
  const [backlogRepoError, setBacklogRepoError] = useState<string | null>(null);
  const [backlogStatus, setBacklogStatus] = useState<Status>(null);
  const [backlogTesting, setBacklogTesting] = useState(false);

  useEffect(() => {
    loadThemePreference(db).then(setTheme);
    getBacklogConfig(db).then((c) => {
      setBacklogRepo(c.repo);
      setBacklogHasToken(c.hasToken);
    });
    getApiConfig().then((c) => {
      setBaseUrl(c.baseUrl);
      setAppKey(c.appKey);
    });
    db.getAllAsync<{ key: string; value: string }>("SELECT key, value FROM settings").then((rows) => {
      const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      if (s.hydration_goal_ml) setGoal(s.hydration_goal_ml);
      if (s.glass_ml) setGlass(s.glass_ml);
    });
  }, [db]);

  const changeTheme = async (pref: ThemePreference) => {
    setTheme(pref);
    await saveThemePreference(db, pref);
  };

  const saveBackend = async () => {
    setTesting(true);
    await setApiConfig(baseUrl, appKey);
    try {
      const res = await api.health();
      setBackendStatus(
        res.authorized
          ? { tone: "success", text: "Connecté au backend." }
          : { tone: "warning", text: "Backend joignable mais clé refusée." },
      );
      if (res.authorized) haptics.success();
    } catch (e) {
      haptics.warning();
      setBackendStatus({ tone: "danger", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  };

  const saveBacklog = async () => {
    if (!parseRepo(backlogRepo)) {
      haptics.warning();
      setBacklogRepoError("Format propriétaire/dépôt, par exemple steb/life-dashboard.");
      return;
    }
    if (!backlogToken.trim() && !backlogHasToken) {
      haptics.warning();
      setBacklogStatus({ tone: "warning", text: "Colle le jeton GitHub pour relier le backlog." });
      return;
    }
    setBacklogTesting(true);
    try {
      await saveBacklogConfig(db, backlogRepo, backlogToken);
      setBacklogToken("");
      setBacklogHasToken(true);
      const state = await syncBacklog(db);
      if (state.error) {
        haptics.warning();
        setBacklogStatus({ tone: "danger", text: state.error });
      } else if (state.offline) {
        setBacklogStatus({ tone: "warning", text: "Enregistré, mais GitHub est injoignable pour l'instant." });
      } else {
        haptics.success();
        setBacklogStatus({ tone: "success", text: `Relié : ${state.items.length} issue${state.items.length > 1 ? "s" : ""}.` });
      }
    } finally {
      setBacklogTesting(false);
    }
  };

  const saveHydration = async () => {
    const goalMl = Number(goal);
    const glassMl = Number(glass);
    const errors = {
      goal: Number.isInteger(goalMl) && goalMl >= 250 && goalMl <= 10000 ? undefined : "Entre 250 et 10 000 ml.",
      glass: Number.isInteger(glassMl) && glassMl >= 50 && glassMl <= 2000 ? undefined : "Entre 50 et 2 000 ml.",
    };
    setHydrationErrors(errors);
    if (errors.goal || errors.glass) {
      haptics.warning();
      setHydrationStatus(null);
      return;
    }
    await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('hydration_goal_ml', ?)", String(goalMl));
    await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('glass_ml', ?)", String(glassMl));
    haptics.success();
    setHydrationStatus({ tone: "success", text: "Enregistré." });
  };

  const enableReminders = async () => {
    const ok = await scheduleDaily("hydration-am", "💧 Hydratation", "Un verre d'eau ?", 10, 30);
    if (!ok) {
      setReminderStatus({
        tone: "warning",
        text: "Les notifications ne se chargent pas dans Expo Go sur Android. Elles fonctionneront dans un build de développement.",
      });
      return;
    }
    await scheduleDaily("hydration-pm", "💧 Hydratation", "Où en est ta jauge ?", 16, 0);
    await scheduleDaily("workout", "🤸 Séance du jour", "10 minutes, c'est parti.", 18, 30);
    haptics.success();
    setReminderStatus({ tone: "success", text: "Rappels activés : 10 h 30 et 16 h pour l'eau, 18 h 30 pour la séance." });
  };

  return (
    <Screen title="Réglages">
      <Card title="Apparence" icon="color-palette" color="sleep" index={0}>
        <Segmented
          value={theme}
          onChange={changeTheme}
          options={[
            { value: "system", label: "Système" },
            { value: "light", label: "Clair" },
            { value: "dark", label: "Sombre" },
          ]}
        />
      </Card>

      <Card title="Backend" subtitle="API sur ton PC (HTTPS obligatoire en release)" icon="server" color="settings" index={1}>
        <Field
          label="URL"
          value={baseUrl}
          onChangeText={setBaseUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://192.168.1.20:3000"
        />
        <Field
          label="Clé (APP_KEY)"
          value={appKey}
          onChangeText={setAppKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <Button label="Enregistrer et tester" icon="pulse" onPress={saveBackend} loading={testing} />
        {backendStatus ? <Notice tone={backendStatus.tone}>{backendStatus.text}</Notice> : null}
      </Card>

      <Card title="Backlog" subtitle="Issues GitHub du dépôt de l'app" icon="git-branch" color="settings" index={2}>
        <Field
          label="Dépôt"
          value={backlogRepo}
          onChangeText={(v) => (setBacklogRepo(v), setBacklogRepoError(null))}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="propriétaire/life-dashboard"
          error={backlogRepoError}
        />
        <Field
          label="Jeton GitHub"
          value={backlogToken}
          onChangeText={setBacklogToken}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder={backlogHasToken ? "Enregistré · laisse vide pour le garder" : "github_pat_…"}
          helper="Jeton « fine-grained » limité à ce seul dépôt, permission Issues en lecture et écriture. Il reste chiffré sur le téléphone."
        />
        <Button label="Enregistrer et synchroniser" icon="sync" variant="secondary" onPress={saveBacklog} loading={backlogTesting} />
        {backlogStatus ? <Notice tone={backlogStatus.tone}>{backlogStatus.text}</Notice> : null}
      </Card>

      <Card title="Hydratation" icon="water" color="water" index={3}>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field
              label="Objectif (ml)"
              value={goal}
              onChangeText={(v) => (setGoal(v), setHydrationErrors({ ...hydrationErrors, goal: undefined }))}
              keyboardType="number-pad"
              error={hydrationErrors.goal}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Un verre (ml)"
              value={glass}
              onChangeText={(v) => (setGlass(v), setHydrationErrors({ ...hydrationErrors, glass: undefined }))}
              keyboardType="number-pad"
              error={hydrationErrors.glass}
            />
          </View>
        </View>
        <Button label="Enregistrer" variant="secondary" icon="save-outline" onPress={saveHydration} />
        {hydrationStatus ? <Notice tone={hydrationStatus.tone}>{hydrationStatus.text}</Notice> : null}
      </Card>

      <Card title="Rappels" icon="notifications" color="primary" index={4}>
        {!notificationsAvailable() ? (
          <Notice tone="info">Expo Go sur Android : les rappels sont désactivés. Les alertes restent visibles dans Aujourd'hui.</Notice>
        ) : null}
        <Button label="Activer les rappels quotidiens" variant="secondary" icon="alarm-outline" onPress={enableReminders} />
        {reminderStatus ? <Notice tone={reminderStatus.tone}>{reminderStatus.text}</Notice> : null}
      </Card>
    </Screen>
  );
}
