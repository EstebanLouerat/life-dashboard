import { z } from "zod";

/** Aisles used to sort the shopping list, in walking order. */
export const Aisle = z.enum([
  "fruits-legumes",
  "boulangerie",
  "cremerie",
  "viandes-poissons",
  "epicerie-salee",
  "epicerie-sucree",
  "surgeles",
  "boissons",
  "hygiene-entretien",
  "autre",
]);
export type Aisle = z.infer<typeof Aisle>;

export const Store = z.enum(["lidl", "auchan"]);
export type Store = z.infer<typeof Store>;

/** What the app sends to POST /api/groceries. */
export const GroceryRequest = z.object({
  days: z.number().int().min(1).max(7),
  people: z.number().int().min(1).max(6),
  budgetEur: z.number().positive().max(300),
  store: Store,
  mealsPerDay: z.array(z.enum(["dejeuner", "diner"])).min(1).default(["dejeuner", "diner"]),
  /** Free text: dislikes, diet, cooking time... */
  preferences: z.string().max(500).optional(),
  /** Items already at home, so they are not bought again. */
  pantry: z.array(z.string()).default([]),
  /** User-maintained price table, used instead of guesses when present. */
  knownPrices: z
    .array(z.object({ name: z.string(), priceEur: z.number(), unit: z.string() }))
    .default([]),
});
export type GroceryRequest = z.infer<typeof GroceryRequest>;

export const GroceryItem = z.object({
  name: z.string(),
  quantity: z.string(),
  aisle: Aisle,
  estPriceEur: z.number().nonnegative(),
  /** "known" = from knownPrices, "estimate" = Claude's guess. */
  priceSource: z.enum(["known", "estimate"]),
});
export type GroceryItem = z.infer<typeof GroceryItem>;

export const Meal = z.object({
  day: z.number().int().min(1).max(7),
  slot: z.enum(["dejeuner", "diner"]),
  title: z.string(),
  prepMinutes: z.number().int().nonnegative(),
  /** Short steps, 3 to 6. */
  steps: z.array(z.string()),
});
export type Meal = z.infer<typeof Meal>;

/** What Claude returns and the app stores. */
export const GroceryPlan = z.object({
  meals: z.array(Meal),
  items: z.array(GroceryItem),
  totalEstEur: z.number().nonnegative(),
  withinBudget: z.boolean(),
  tips: z.array(z.string()).max(5),
});
export type GroceryPlan = z.infer<typeof GroceryPlan>;
