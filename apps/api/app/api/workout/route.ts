import { WorkoutRequest, WorkoutSession } from "@ld/contracts";
import { generateStructured } from "@/lib/claude";
import { jsonPost } from "@/lib/route";

export const maxDuration = 60;

const SYSTEM = `Tu es coach de mobilité et de renforcement au poids du corps pour un pratiquant de capoeira.
Séance courte, zéro matériel, faisable dans un appartement.
Mobilité ciblée : hanches et adducteurs (ginga, meia lua), ischios, colonne thoracique, poignets et épaules (aú, bananeira).
Renforcement très progressif : choisis la variante en fonction du niveau et de l'historique.
Progression : si les dernières séances sont "trop-facile", augmente un peu (reps, temps ou variante) ; si "dur" ou "trop-dur", baisse ou garde. Explique le choix dans progressionNote.
Respecte strictement la durée demandée en comptant séries, temps et repos.
Contourne toute douleur ou contrainte indiquée ; ne propose rien qui la sollicite.
Pour chaque exercice, renseigne soit reps soit seconds (l'autre à null).
Réponds en français.`;

export const POST = jsonPost(WorkoutRequest, (input) =>
  generateStructured({
    schema: WorkoutSession,
    system: SYSTEM,
    prompt: `Séance du jour :\n${JSON.stringify(input, null, 2)}`,
  }),
);
