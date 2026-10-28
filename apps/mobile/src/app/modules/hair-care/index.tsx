import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Button, Screen } from "@/components/ui";
import { TreatmentCard } from "@/components/TreatmentCard";
import { refreshTreatments, type TreatmentState } from "@/lib/treatments";

export default function HairCareScreen() {
  const db = useSQLiteContext();
  const [states, setStates] = useState<TreatmentState[]>([]);

  const load = useCallback(async () => setStates(await refreshTreatments(db)), [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen back title="Hair care" subtitle="Traitements, stock et suivi">
      {states.map((s, i) => (
        <TreatmentCard key={s.treatment.id} state={s} onChanged={load} index={i} />
      ))}
      <Button
        label="Nouveau traitement"
        icon="add"
        variant="soft"
        onPress={() => router.push({ pathname: "/modules/hair-care/[id]", params: { id: "new" } })}
      />
    </Screen>
  );
}
