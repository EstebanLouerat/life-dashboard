import { useCallback, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { IconButton, LocalBadge, Screen, SkeletonCard } from "@/components/ui";
import { TreatmentCard } from "@/components/TreatmentCard";
import { refreshTreatments, type TreatmentState } from "@/lib/treatments";

/** One treatment in full: today's doses, stock, renewals, adherence and the last five weeks. */
export default function TreatmentDetailScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<TreatmentState | null | undefined>(undefined);

  const load = useCallback(async () => {
    const all = await refreshTreatments(db);
    setState(all.find((s) => String(s.treatment.id) === id) ?? null);
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen
      back
      domain="sante"
      title={state?.treatment.name ?? "Traitement"}
      subtitle="Stock, prises et observance"
      right={
        state ? (
          <IconButton
            icon="create-outline"
            label={`Modifier ${state.treatment.name}`}
            onPress={() => router.push({ pathname: "/sante/traitements/modifier", params: { id: String(state.treatment.id) } })}
          />
        ) : undefined
      }
    >
      <LocalBadge />
      {state === undefined ? <SkeletonCard /> : state ? <TreatmentCard state={state} onChanged={load} index={0} /> : null}
    </Screen>
  );
}
