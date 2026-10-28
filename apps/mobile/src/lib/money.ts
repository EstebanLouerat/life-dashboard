/** Amounts are stored as integer cents; floats only exist at display time. */

const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const wholeEuros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** "9,99 €"; `round` drops the cents ("516 €"), for totals and estimates. */
export function formatCents(cents: number, round = false): string {
  return (round ? wholeEuros : euros).format(cents / 100);
}

/** "9,99", "9.99", "1 299,50 €" → cents. null if not a positive amount. */
export function parseEuros(input: string): number | null {
  const cleaned = input.replace(/[\s  €]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** Cents → editable text: 999 → "9,99", 1000 → "10". */
export function centsToInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace(".", ",");
}
