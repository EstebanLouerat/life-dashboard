/** Local-time YYYY-MM-DD (not UTC: a glass at 00:30 belongs to the new day in Lyon). */
export function today(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function hoursBetween(startIso: string, endIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / 36e5;
}

/** Local Date at the given time of a YYYY-MM-DD day. */
export function atLocalTime(day: string, hour = 0, minute = 0, second = 0, ms = 0): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, hour, minute, second, ms);
}

/** Day arithmetic on YYYY-MM-DD strings (calendar days, DST-safe). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Calendar days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

/** "JJ/MM/AAAA" → "YYYY-MM-DD", or null if it is not a real date. */
export function parseFrDate(input: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input.trim());
  if (!match) return null;
  const [, d, m, y] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → "JJ/MM/AAAA". */
export function formatFrDate(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

/** "YYYY-MM-DD" → "7 nov." */
export function shortFrDate(day: string): string {
  return atLocalTime(day, 12).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
