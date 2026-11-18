import type { SQLiteDatabase } from "expo-sqlite";

/** Key / value settings table: everything is stored as text. */
export async function readSettings(db: SQLiteDatabase): Promise<Record<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>("SELECT key, value FROM settings");
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function writeSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", key, value);
}

/** A whole number from settings, or `fallback` when missing or unreadable. */
export function intSetting(settings: Record<string, string>, key: string, fallback: number): number {
  const n = Number(settings[key]);
  return Number.isFinite(n) && settings[key] !== "" && settings[key] !== undefined ? Math.round(n) : fallback;
}
