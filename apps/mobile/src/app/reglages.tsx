import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import { Body, Button, Card, Field, Screen } from "@/components/ui";
import { api, getApiConfig, setApiConfig } from "@/lib/api";
import { scheduleDaily } from "@/lib/notifications";

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [baseUrl, setBaseUrl] = useState("");
  const [appKey, setAppKey] = useState("");
  const [goal, setGoal] = useState("2000");
  const [glass, setGlass] = useState("250");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
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

  const saveBackend = async () => {
    await setApiConfig(baseUrl, appKey);
    try {
      const res = await api.health();
      setStatus(res.authorized ? "✅ Connecté" : "⚠️ Backend joignable mais clé refusée");
    } catch (e) {
      setStatus(`❌ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const saveHydration = async () => {
    await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('hydration_goal_ml', ?)", String(Number(goal) || 2000));
    await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('glass_ml', ?)", String(Number(glass) || 250));
    Alert.alert("Enregistré");
  };

  const enableReminders = async () => {
    await scheduleDaily("hydration-am", "💧 Hydratation", "Un verre d'eau ?", 10, 30);
    await scheduleDaily("hydration-pm", "💧 Hydratation", "Où en est ta jauge ?", 16, 0);
    await scheduleDaily("workout", "🤸 Séance du jour", "10 minutes, c'est parti.", 18, 30);
    Alert.alert("Rappels activés", "10h30 et 16h pour l'eau, 18h30 pour la séance.");
  };

  return (
    <Screen>
      <Card title="Backend">
        <Field label="URL" value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" autoCorrect={false} placeholder="http://192.168.1.20:3000" />
        <Field label="Clé (APP_KEY)" value={appKey} onChangeText={setAppKey} autoCapitalize="none" autoCorrect={false} secureTextEntry />
        <Button label="Enregistrer et tester" onPress={saveBackend} />
        {status ? <Body>{status}</Body> : null}
      </Card>

      <Card title="Hydratation">
        <Field label="Objectif (ml)" value={goal} onChangeText={setGoal} keyboardType="number-pad" />
        <Field label="Taille d'un verre (ml)" value={glass} onChangeText={setGlass} keyboardType="number-pad" />
        <Button label="Enregistrer" variant="secondary" onPress={saveHydration} />
      </Card>

      <Card title="Rappels">
        <Button label="Activer les rappels quotidiens" variant="secondary" onPress={enableReminders} />
      </Card>
    </Screen>
  );
}
