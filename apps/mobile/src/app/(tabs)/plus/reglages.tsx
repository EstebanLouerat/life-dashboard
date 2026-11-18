import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  Button,
  Card,
  DomainScope,
  Field,
  Icon,
  ListRow,
  Notice,
  Screen,
  SectionTitle,
  Segmented,
  Sheet,
  Slider,
  space,
  Stepper,
  Switch,
  Txt,
  useTheme,
} from "@/components/ui";
import { api, getApiConfig, setApiConfig } from "@/lib/api";
import { loadThemePreference, saveThemePreference, type ThemePreference } from "@/lib/appearance";
import { getBacklogConfig, saveBacklogConfig, syncBacklog } from "@/lib/backlog";
import { parseRepo } from "@/lib/backlogGithub";
import { haptics } from "@/lib/haptics";
import { refreshHairChecks } from "@/lib/hairChecks";
import { notificationsAvailable } from "@/lib/notifications";
import { loadReminderPrefs, saveReminderPrefs } from "@/lib/reminderSettings";
import { DEFAULT_PREFS, HYDRATION_END_HOUR, HYDRATION_INTERVALS, HYDRATION_START_HOUR, hydrationTimes, intervalLabel, WORKOUT_REMINDER, type ReminderPrefs } from "@/lib/reminders";
import { intSetting, readSettings, writeSetting } from "@/lib/settings";
import { refreshTreatments } from "@/lib/treatments";

type Status = { tone: "success" | "warning" | "danger"; text: string } | null;
type Server = { status: "ok" | "refused" | "error" | null; at: string | null };

const THEME_LABEL: Record<ThemePreference, string> = { system: "Automatique (système)", light: "Clair", dark: "Sombre" };
const fr = new Intl.NumberFormat("fr-FR");
const hm = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/**
 * Server, backlog, hydration goal, reminders and theme. Every switch is
 * saved on the tap; reminders are rescheduled with their stable ids.
 */
export default function SettingsScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [themeSheet, setThemeSheet] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [appKey, setAppKey] = useState("");
  const [server, setServer] = useState<Server>({ status: null, at: null });
  const [testing, setTesting] = useState(false);
  const [goal, setGoal] = useState(2000);
  const [glass, setGlass] = useState(250);
  const [editing, setEditing] = useState<"goal" | "glass" | null>(null);
  const [draft, setDraft] = useState(0);
  const [prefs, setPrefs] = useState<ReminderPrefs>(DEFAULT_PREFS);
  const [backlogRepo, setBacklogRepo] = useState("");
  const [backlogToken, setBacklogToken] = useState("");
  const [backlogHasToken, setBacklogHasToken] = useState(false);
  const [backlogRepoError, setBacklogRepoError] = useState<string | null>(null);
  const [backlogStatus, setBacklogStatus] = useState<Status>(null);
  const [backlogTesting, setBacklogTesting] = useState(false);

  useEffect(() => {
    loadThemePreference(db).then(setTheme);
    getApiConfig().then((c) => {
      setBaseUrl(c.baseUrl);
      setAppKey(c.appKey);
    });
    getBacklogConfig(db).then((c) => {
      setBacklogRepo(c.repo);
      setBacklogHasToken(c.hasToken);
    });
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      readSettings(db).then((s) => {
        setGoal(intSetting(s, "hydration_goal_ml", 2000));
        setGlass(intSetting(s, "glass_ml", 250));
        setServer({ status: (s.api_status as Server["status"]) || null, at: s.api_checked_at || null });
      });
      loadReminderPrefs(db).then(setPrefs);
    }, [db]),
  );

  const testServer = async () => {
    setTesting(true);
    await setApiConfig(baseUrl, appKey);
    let status: Server["status"] = "error";
    try {
      const res = await api.health();
      status = res.authorized ? "ok" : "refused";
      if (res.authorized) haptics.success();
      else haptics.warning();
    } catch {
      haptics.warning();
    } finally {
      const at = new Date().toISOString();
      setServer({ status, at });
      await writeSetting(db, "api_status", status);
      await writeSetting(db, "api_checked_at", at);
      setTesting(false);
    }
  };

  const updatePrefs = async (next: ReminderPrefs) => {
    setPrefs(next);
    await saveReminderPrefs(db, next);
    await refreshTreatments(db, { doseReminders: true });
    await refreshHairChecks(db, { reminder: true });
  };

  const saveHydration = async () => {
    if (editing === "goal") {
      setGoal(draft);
      await writeSetting(db, "hydration_goal_ml", String(draft));
    } else if (editing === "glass") {
      setGlass(draft);
      await writeSetting(db, "glass_ml", String(draft));
    }
    haptics.success();
    setEditing(null);
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

  const serverLine =
    server.status === "ok"
      ? { text: `Connecté · vérifié à ${hm(server.at!)}`, tone: "accent" as const }
      : server.status === "refused"
        ? { text: "Joignable, mais clé refusée", tone: "warning" as const }
        : server.status === "error"
          ? { text: `Injoignable${server.at ? ` · essai à ${hm(server.at)}` : ""}`, tone: "danger" as const }
          : { text: "Pas encore testé", tone: "muted" as const };
  const reminderCount = hydrationTimes(prefs.hydrationInterval).length;
  const intervalIndex = Math.max(0, (HYDRATION_INTERVALS as readonly number[]).indexOf(prefs.hydrationInterval));

  return (
    <Screen back title="Réglages" domain="encre">
      <SectionTitle>Serveur</SectionTitle>
      <Card>
        <Field
          label="Adresse du serveur"
          value={baseUrl}
          onChangeText={setBaseUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://192.168.1.20:3000"
          helper="Serveur personnel sur le réseau local (HTTPS obligatoire en version publiée)."
        />
        <Field
          label="Clé d'accès"
          value={appKey}
          onChangeText={setAppKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          helper="Stockée chiffrée sur ce téléphone."
        />
        <ListRow icon="server-outline" title="État" subtitle={serverLine.text} subtitleTone={serverLine.tone === "accent" ? "accent" : serverLine.tone === "muted" ? "muted" : serverLine.tone} />
        <Button variant="outline" icon="refresh" label="Tester la connexion" loading={testing} onPress={testServer} />
      </Card>

      <SectionTitle>Hydratation</SectionTitle>
      <Card style={{ gap: 0 }}>
        <DomainScope domain="eau">
          <ListRow
            icon="disc-outline"
            iconColor="eau"
            title="Objectif quotidien"
            subtitle={`${fr.format(goal)} ml`}
            onPress={() => {
              setDraft(goal);
              setEditing("goal");
            }}
          />
          <ListRow
            icon="water-outline"
            iconColor="eau"
            title="Taille du verre"
            subtitle={`${fr.format(glass)} ml`}
            onPress={() => {
              setDraft(glass);
              setEditing("glass");
            }}
          />
        </DomainScope>
      </Card>

      <SectionTitle>Rappels</SectionTitle>
      {!notificationsAvailable() ? (
        <Notice tone="info">Expo Go sur Android : les rappels ne partent pas. Tes choix sont gardés pour le build, et les alertes restent visibles dans Aujourd'hui.</Notice>
      ) : null}
      <Card style={{ gap: 0 }}>
        <ListRow
          icon="water-outline"
          iconColor="eau"
          title="Hydratation"
          subtitle={`De ${HYDRATION_START_HOUR} h à ${HYDRATION_END_HOUR} h · ${reminderCount} rappels`}
          right={<Switch domain="eau" label="Rappels d'hydratation" value={prefs.hydration} onChange={(v) => updatePrefs({ ...prefs, hydration: v })} />}
        />
        {prefs.hydration ? (
          <DomainScope domain="eau">
            <View style={{ paddingLeft: 36, paddingBottom: space.md, gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Txt variant="callout" tone="muted">
                  Intervalle
                </Txt>
                <Txt variant="label" tone="accent">
                  {intervalLabel(prefs.hydrationInterval)}
                </Txt>
              </View>
              <Slider
                steps={HYDRATION_INTERVALS.length}
                value={intervalIndex}
                label="Intervalle des rappels d'hydratation"
                valueText={intervalLabel(prefs.hydrationInterval)}
                onChange={(i) => updatePrefs({ ...prefs, hydrationInterval: HYDRATION_INTERVALS[i] })}
              />
            </View>
          </DomainScope>
        ) : null}
        <ListRow
          icon="medkit-outline"
          iconColor="sante"
          title="Traitements"
          subtitle="À l'heure de rappel de chaque traitement"
          right={<Switch domain="sante" label="Rappels des traitements" value={prefs.treatments} onChange={(v) => updatePrefs({ ...prefs, treatments: v })} />}
        />
        <ListRow
          icon="warning-outline"
          iconColor="sante"
          title="Renouvellement"
          subtitle="Avant la fin du stock et de l'ordonnance"
          right={<Switch domain="sante" label="Rappels de renouvellement" value={prefs.renewal} onChange={(v) => updatePrefs({ ...prefs, renewal: v })} />}
        />
        <ListRow
          icon="camera-outline"
          iconColor="sante"
          title="Photo mensuelle"
          subtitle="Le jour de la série, à 10:00"
          right={<Switch domain="sante" label="Rappel de la photo mensuelle" value={prefs.hairPhoto} onChange={(v) => updatePrefs({ ...prefs, hairPhoto: v })} />}
        />
        <ListRow
          icon="pulse-outline"
          iconColor="sport"
          title="Séance du jour"
          subtitle={`${WORKOUT_REMINDER.hour}:${String(WORKOUT_REMINDER.minute).padStart(2, "0")}`}
          right={<Switch domain="sport" label="Rappel de la séance du jour" value={prefs.workout} onChange={(v) => updatePrefs({ ...prefs, workout: v })} />}
        />
      </Card>

      <SectionTitle>Backlog</SectionTitle>
      <Card>
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
        <Button label="Enregistrer et synchroniser" icon="sync" variant="outline" onPress={saveBacklog} loading={backlogTesting} />
        {backlogStatus ? <Notice tone={backlogStatus.tone}>{backlogStatus.text}</Notice> : null}
      </Card>

      <SectionTitle>Apparence</SectionTitle>
      <Card style={{ gap: 0 }}>
        <ListRow icon="sunny-outline" title="Thème" subtitle={THEME_LABEL[theme]} onPress={() => setThemeSheet(true)} />
      </Card>

      <View style={{ flexDirection: "row", gap: space.sm, paddingHorizontal: space.xs }}>
        <Icon name="phone-portrait-outline" size={14} color={t.textSubtle} />
        <Txt variant="caption" tone="subtle" style={{ flex: 1 }}>
          Les données santé (traitements, sommeil, photos) ne quittent jamais ce téléphone.
        </Txt>
      </View>

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing === "goal" ? "Objectif quotidien" : "Taille du verre"}>
        <DomainScope domain="eau">
          <View style={{ gap: space.md }}>
            {editing === "goal" ? (
              <Stepper
                label="Objectif"
                value={`${fr.format(draft)} ml`}
                canDecrement={draft > 500}
                canIncrement={draft < 5000}
                onDecrement={() => setDraft((d) => Math.max(500, d - 250))}
                onIncrement={() => setDraft((d) => Math.min(5000, d + 250))}
              />
            ) : (
              <Stepper
                label="Un verre"
                value={`${fr.format(draft)} ml`}
                canDecrement={draft > 50}
                canIncrement={draft < 1000}
                onDecrement={() => setDraft((d) => Math.max(50, d - 50))}
                onIncrement={() => setDraft((d) => Math.min(1000, d + 50))}
              />
            )}
            <View style={{ flexDirection: "row", gap: space.md }}>
              <Button label="Annuler" variant="outline" style={{ flex: 1 }} onPress={() => setEditing(null)} />
              <Button label="Enregistrer" style={{ flex: 1 }} onPress={saveHydration} />
            </View>
          </View>
        </DomainScope>
      </Sheet>

      <Sheet visible={themeSheet} onClose={() => setThemeSheet(false)} title="Thème">
        <Segmented
          value={theme}
          onChange={async (pref) => {
            setTheme(pref);
            await saveThemePreference(db, pref);
          }}
          options={[
            { value: "system", label: "Système" },
            { value: "light", label: "Clair" },
            { value: "dark", label: "Sombre" },
          ]}
        />
      </Sheet>
    </Screen>
  );
}
