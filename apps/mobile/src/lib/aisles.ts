import type { Aisle } from "@ld/contracts";

/** Aisle names, in the store's walking order (Courses list and its widget). */
export const AISLE_LABEL: Record<Aisle, string> = {
  "fruits-legumes": "Fruits et légumes",
  boulangerie: "Boulangerie",
  cremerie: "Crèmerie",
  "viandes-poissons": "Boucherie et poissons",
  "epicerie-salee": "Épicerie salée",
  "epicerie-sucree": "Épicerie sucrée",
  surgeles: "Surgelés",
  boissons: "Boissons",
  "hygiene-entretien": "Hygiène et entretien",
  autre: "Autre",
};
export const AISLE_ORDER = Object.keys(AISLE_LABEL) as Aisle[];
