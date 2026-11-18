import type { SQLiteDatabase } from "expo-sqlite";
import { hoursBetween, today } from "@/lib/dates";
import { bucketFromHours, isBucket, mergeNights, type Bucket, type Night } from "@/lib/sleep";

/**
 * Nights on the phone: ranges tapped on Today (sleep_nights) and the older
 * bed / wake entries (sleep_log), keyed by the morning they ended on.
 * Health data: it never leaves the phone.
 */
export async function loadNights(db: SQLiteDatabase): Promise<Night[]> {
  const tapped = await db.getAllAsync<{ day: string; bucket: number }>(
    "SELECT day, bucket FROM sleep_nights ORDER BY day DESC LIMIT 60",
  );
  const legacy = await db.getAllAsync<{ bed_at: string; wake_at: string }>(
    "SELECT bed_at, wake_at FROM sleep_log WHERE wake_at IS NOT NULL ORDER BY id DESC LIMIT 60",
  );
  return mergeNights(
    tapped.filter((r) => isBucket(r.bucket)).map((r) => ({ day: r.day, bucket: r.bucket as Bucket })),
    legacy.map((r) => ({ day: today(new Date(r.wake_at)), bucket: bucketFromHours(hoursBetween(r.bed_at, r.wake_at)) })),
  );
}

/** Sets (or clears, with null) the range of the night that ended on `day`. */
export async function setNight(db: SQLiteDatabase, day: string, bucket: Bucket | null): Promise<void> {
  if (bucket === null) {
    await db.runAsync("DELETE FROM sleep_nights WHERE day = ?", day);
    return;
  }
  await db.runAsync(
    "INSERT INTO sleep_nights (day, bucket, logged_at) VALUES (?, ?, ?) ON CONFLICT (day) DO UPDATE SET bucket = excluded.bucket, logged_at = excluded.logged_at",
    day,
    bucket,
    new Date().toISOString(),
  );
}
