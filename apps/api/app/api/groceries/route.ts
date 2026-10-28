import { GroceryPlan, GroceryRequest } from "@ld/contracts";
import { generateStructured } from "@/lib/claude";
import { jsonPost } from "@/lib/route";

export const maxDuration = 60;

const SYSTEM = `Tu planifies les repas et la liste de courses d'un jeune actif à Lyon.
Objectifs, dans l'ordre : respecter le budget, cuisiner simple (30 min max en semaine), manger correctement.
Règles :
- Réutilise les mêmes ingrédients sur plusieurs repas pour limiter le gaspillage et le coût.
- Privilégie les produits de saison et les marques distributeur du magasin demandé.
- N'achète pas ce qui est dans le placard (pantry).
- Si un produit figure dans knownPrices, utilise ce prix et mets priceSource "known" ; sinon estime un prix réaliste pour ce magasin et mets "estimate".
- Quantités adaptées au nombre de personnes et de jours.
- totalEstEur = somme des estPriceEur ; withinBudget indique si c'est sous le budget.
- tips : 0 à 5 conseils courts (batch cooking, conservation...).
Réponds en français.`;

export const POST = jsonPost(GroceryRequest, (input) =>
  generateStructured({
    schema: GroceryPlan,
    system: SYSTEM,
    prompt: `Paramètres de la semaine :\n${JSON.stringify(input, null, 2)}`,
    maxTokens: 8000,
  }),
);
