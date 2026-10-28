import { useState } from "react";
import { View } from "react-native";
import Constants from "expo-constants";
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import type { BacklogKind } from "@ld/contracts";
import { Button, Chips, Field, Notice, Screen, Segmented, space, Txt } from "@/components/ui";
import { BACKLOG_MODULES, captureItem, moduleFromPath, moduleLabel } from "@/lib/backlog";
import { haptics } from "@/lib/haptics";

/**
 * Quick capture of an idea or a bug, opened over any screen. The issue body
 * records the app version and the screen it came from; without network or
 * before setup, it waits in the outbox.
 */
export default function CaptureScreen() {
  const db = useSQLiteContext();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [kind, setKind] = useState<BacklogKind>("idea");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [module, setModule] = useState(moduleFromPath(from) ?? "none");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!title.trim()) {
      haptics.warning();
      setError("Donne un titre.");
      return;
    }
    setSending(true);
    try {
      const origin = from ? `${moduleLabel(moduleFromPath(from))} (${from})` : "inconnu";
      const description = [
        details.trim(),
        "---",
        `Version de l'app : ${Constants.expoConfig?.version ?? "?"}`,
        `Écran d'origine : ${origin}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      // Sent or queued, it is safe on the phone; the Backlog screen lists what still waits.
      await captureItem(db, { title: title.trim(), description, kind, module: module === "none" ? null : module });
      haptics.success();
      router.back();
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen back title={kind === "bug" ? "Signaler un bug" : "Noter une idée"}>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: "idea", label: "Idée" },
          { value: "bug", label: "Bug" },
        ]}
      />
      <Field
        label="Titre"
        value={title}
        onChangeText={(v) => {
          setTitle(v);
          setError(null);
        }}
        error={error}
        placeholder={kind === "bug" ? "ex. Le stock ne se met pas à jour" : "ex. Rappel pour arroser les plantes"}
        autoFocus
      />
      <Field
        label={kind === "bug" ? "Ce qui s'est passé" : "Détails"}
        value={details}
        onChangeText={setDetails}
        placeholder="Facultatif"
        multiline
      />
      <View style={{ gap: 6 }}>
        <Txt variant="caption" tone="muted">
          Module
        </Txt>
        <Chips value={module} onChange={setModule} options={[{ value: "none", label: "Général" }, ...BACKLOG_MODULES]} />
      </View>
      <Notice tone="info">La version de l'app et l'écran d'origine sont ajoutés à la description. Hors ligne, l'issue part au retour du réseau.</Notice>
      <View style={{ gap: space.sm }}>
        <Button label="Envoyer" icon="paper-plane-outline" onPress={send} loading={sending} />
      </View>
    </Screen>
  );
}
