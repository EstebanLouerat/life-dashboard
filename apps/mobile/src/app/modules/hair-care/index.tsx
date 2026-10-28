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
    <Screen>
      {states.map((s) => (
        <TreatmentCard key={s.treatment.id} state={s} onChanged={load} />
      ))}
      <Button
        label="+ Nouveau traitement"
        variant="secondary"
        onPress={() => router.push({ pathname: "/modules/hair-care/[id]", params: { id: "new" } })}
      />
    </Screen>
  );
}
