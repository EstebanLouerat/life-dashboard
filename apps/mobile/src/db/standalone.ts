import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { migrate } from "@/db/migrations";

let dbPromise: Promise<SQLiteDatabase> | null = null;

/**
 * The app database outside React's tree: widget taps and notification
 * buttons, which also run headless (app killed). Same file as SQLiteProvider.
 */
export function database(): Promise<SQLiteDatabase> {
  dbPromise ??= openDatabaseAsync("life-dashboard.db")
    .then(async (db) => {
      await migrate(db);
      return db;
    })
    .catch((e) => {
      dbPromise = null;
      throw e;
    });
  return dbPromise;
}
