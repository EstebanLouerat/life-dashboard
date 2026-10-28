import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Button, Card, IconButton, Screen, Txt } from "@/components/ui";
import { TreatmentCard } from "@/components/TreatmentCard";
import { hairCheckStatus } from "@/components/HairCheckToday";
import { shortFrDate } from "@/lib/dates";
import { refreshHairChecks, type HairState } from "@/lib/hairChecks";
import { refreshTreatments, type TreatmentState } from "@/lib/treatments";

export default function HairCareScreen() {
  const db = useSQLiteContext();
  const [states, setStates] = useState<TreatmentState[]>([]);
  const [hair, setHair] = useState<HairState | null>(null);

  const load = useCallback(async () => {
    setStates(await refreshTreatments(db));
    setHair(await refreshHairChecks(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const status = hair ? hairCheckStatus(hair) : null;

  return (
    <Screen back title="Hair care" subtitle="Traitements, stock, suivi photo">
      {hair ? (
        <Card
          title="Suivi photo"
          subtitle={hair.lastDay ? `Dernier check le ${shortFrDate(hair.lastDay)} · prochain le ${shortFrDate(hair.due)}` : "Un check par mois, 4 zones"}
          icon="camera"
          color="care"
          index={0}
          right={
            hair.photos.length ? (
              <IconButton icon="images-outline" variant="soft" label="Voir les photos" onPress={() => router.push("/modules/hair-care/photos")} />
            ) : undefined
          }
        >
          {status ? (
            <Txt variant="callout" tone={hair.overdue ? "warning" : "muted"}>
              {status.text}
            </Txt>
          ) : null}
          <Button
            size="sm"
            variant={status ? "primary" : "soft"}
            icon="camera-outline"
            label={hair.open ? "Reprendre le check" : "Faire le check"}
            onPress={() => router.push("/hair-check")}
          />
        </Card>
      ) : null}
      {states.map((s, i) => (
        <TreatmentCard key={s.treatment.id} state={s} onChanged={load} index={i + 1} />
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
