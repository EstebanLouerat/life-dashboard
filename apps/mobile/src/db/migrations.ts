import type { SQLiteDatabase } from "expo-sqlite";

/**
 * Append-only list. Never edit a migration that has shipped to the phone:
 * add a new entry instead. PRAGMA user_version tracks how many have run.
 */
const MIGRATIONS: string[] = [
  // 1 — core trackers
  `
  CREATE TABLE hydration_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,            -- YYYY-MM-DD, local time
    ml INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_hydration_day ON hydration_log(day);

  CREATE TABLE sleep_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bed_at TEXT NOT NULL,         -- ISO timestamp
    wake_at TEXT,                 -- null while asleep
    quality INTEGER               -- 1..5
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  INSERT INTO settings (key, value) VALUES
    ('hydration_goal_ml', '2000'),
    ('glass_ml', '250');
  `,
  // 2 — Claude-generated plans (stored as validated JSON)
  `
  CREATE TABLE grocery_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    request_json TEXT NOT NULL,
    plan_json TEXT NOT NULL
  );
  CREATE TABLE grocery_checks (
    plan_id INTEGER NOT NULL REFERENCES grocery_plans(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    PRIMARY KEY (plan_id, item_name)
  );

  CREATE TABLE workout_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    session_json TEXT NOT NULL,
    rpe TEXT,                     -- trop-facile | ok | dur | trop-dur
    note TEXT
  );
  `,
];

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  let version = row?.user_version ?? 0;

  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
    });
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}
