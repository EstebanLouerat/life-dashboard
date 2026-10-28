import { useEffect, useState } from "react";
import { View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import { Button, Card, Field, Notice, Screen, Segmented, space } from "@/components/ui";
import { api, getApiConfig, setApiConfig } from "@/lib/api";
import { loadThemePreference, saveThemePreference, type ThemePreference } from "@/lib/appearance";
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
  const [reminderStatus, setReminderStatus] = useState<Status>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadThemePreference(db).then(setTheme);
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

  const saveHydration = async () => {
    await db.runAsync(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('hydration_goal_ml', ?)",
      String(Number(goal) || 2000),
    );
    await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('glass_ml', ?)", String(Number(glass) || 250));
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

      <Card title="Hydratation" icon="water" color="water" index={2}>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field label="Objectif (ml)" value={goal} onChangeText={setGoal} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Un verre (ml)" value={glass} onChangeText={setGlass} keyboardType="number-pad" />
          </View>
        </View>
        <Button label="Enregistrer" variant="secondary" icon="save-outline" onPress={saveHydration} />
        {hydrationStatus ? <Notice tone={hydrationStatus.tone}>{hydrationStatus.text}</Notice> : null}
      </Card>

      <Card title="Rappels" icon="notifications" color="primary" index={3}>
        {!notificationsAvailable() ? (
          <Notice tone="info">Expo Go sur Android : les rappels sont désactivés. Les alertes restent visibles dans Aujourd'hui.</Notice>
        ) : null}
        <Button label="Activer les rappels quotidiens" variant="secondary" icon="alarm-outline" onPress={enableReminders} />
        {reminderStatus ? <Notice tone={reminderStatus.tone}>{reminderStatus.text}</Notice> : null}
      </Card>
    </Screen>
  );
}
