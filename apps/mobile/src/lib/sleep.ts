/**
 * Sleep as Today logs it: one tap on a duration range for last night. Older
 * bed / wake entries (sleep_log) still count, converted to a range. Pure.
 */
import { addDays, isoWeekday } from "./dates.ts";

export const SLEEP_BUCKETS = ["< 6 h", "6–7 h", "7–8 h", "8 h +"] as const;
export type Bucket = 0 | 1 | 2 | 3;

export type Night = { day: string; bucket: Bucket };

export function isBucket(n: number): n is Bucket {
  return n === 0 || n === 1 || n === 2 || n === 3;
}

export function bucketFromHours(hours: number): Bucket {
  if (hours < 6) return 0;
  if (hours < 7) return 1;
  if (hours < 8) return 2;
  return 3;
}

/** One night per morning: a range tapped on Today beats an older bed / wake entry of the same day. */
export function mergeNights(tapped: Night[], legacy: Night[]): Night[] {
  const byDay = new Map<string, Night>();
  for (const n of legacy) byDay.set(n.day, n);
  for (const n of tapped) byDay.set(n.day, n);
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

const INITIALS = ["L", "M", "M", "J", "V", "S", "D"];

/** "L" for Monday … "D" for Sunday. */
export function weekdayInitial(day: string): string {
  return INITIALS[isoWeekday(day) - 1];
}

/** The `n` mornings before `day`, oldest first, with their range or null when not logged. */
export function previousNights(nights: Night[], day: string, n = 7): { day: string; bucket: Bucket | null }[] {
  const byDay = new Map(nights.map((x) => [x.day, x.bucket]));
  return Array.from({ length: n }, (_, i) => {
    const d = addDays(day, i - n);
    return { day: d, bucket: byDay.get(d) ?? null };
  });
}

/** Most frequent range among logged nights (the longer one on a tie), or null. */
export function usualBucket(buckets: (Bucket | null)[]): Bucket | null {
  const counts = [0, 0, 0, 0];
  for (const b of buckets) if (b !== null) counts[b]++;
  const max = Math.max(...counts);
  if (max === 0) return null;
  return counts.lastIndexOf(max) as Bucket;
}

/** "7 nuits précédentes : surtout 7–8 h". */
export function nightsSummary(buckets: (Bucket | null)[]): string {
  const usual = usualBucket(buckets);
  if (usual === null) return "Tes nuits notées apparaîtront ici, sur 7 jours.";
  return `${buckets.length} nuits précédentes : surtout ${SLEEP_BUCKETS[usual]}`;
}

/** "4 entre 7 et 8 h · 1 de moins de 6 h", for the Santé › Suivi card. */
export function nightsDetail(buckets: (Bucket | null)[]): string {
  const logged = buckets.filter((b): b is Bucket => b !== null);
  if (logged.length === 0) return "Aucune nuit notée ces 7 derniers jours.";
  const parts: string[] = [];
  const good = logged.filter((b) => b === 2).length;
  const long = logged.filter((b) => b === 3).length;
  const short = logged.filter((b) => b === 0).length;
  if (good) parts.push(`${good} entre 7 et 8 h`);
  if (long) parts.push(`${long} de 8 h ou plus`);
  if (short) parts.push(`${short} de moins de 6 h`);
  if (parts.length === 0) parts.push(`${logged.length} entre 6 et 7 h`);
  return `${buckets.length} dernières nuits : ${parts.join(" · ")}`;
}
