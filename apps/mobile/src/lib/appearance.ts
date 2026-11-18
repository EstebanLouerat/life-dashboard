import { Appearance } from "react-native";
import type { SQLiteDatabase } from "expo-sqlite";

export type ThemePreference = "system" | "light" | "dark";

/**
 * Overrides the OS colour scheme for the whole app (useColorScheme, native
 * alerts, keyboard). Stored in the settings table under "theme".
 */
export function applyThemePreference(pref: ThemePreference) {
  // Not implemented by react-native-web: the web preview follows the browser's scheme.
  if (typeof Appearance.setColorScheme !== "function") return;
  Appearance.setColorScheme(pref === "system" ? "unspecified" : pref);
}

export async function loadThemePreference(db: SQLiteDatabase): Promise<ThemePreference> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'theme'");
  const pref: ThemePreference = row?.value === "light" || row?.value === "dark" ? row.value : "system";
  applyThemePreference(pref);
  return pref;
}

export async function saveThemePreference(db: SQLiteDatabase, pref: ThemePreference) {
  await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', ?)", pref);
  applyThemePreference(pref);
}
