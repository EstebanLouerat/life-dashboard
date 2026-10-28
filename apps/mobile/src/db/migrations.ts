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
  // 3 — treatments (hair care phase 1). Stock is derived from events, see lib/stock.ts.
  `
  CREATE TABLE treatments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL DEFAULT 'hair',
    name TEXT NOT NULL,
    unit TEXT NOT NULL,                        -- comprimé | gélule | ml
    package_size REAL,                         -- default quantity of "Nouvelle boîte"
    waste_pct REAL NOT NULL DEFAULT 0,         -- 0.1 = 10 % margin
    reminder_time TEXT,                        -- HH:MM local, null = no reminder
    renewal_lead_days INTEGER NOT NULL DEFAULT 10,
    prescription_expires_on TEXT,              -- YYYY-MM-DD
    prescription_lead_days INTEGER NOT NULL DEFAULT 10,
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT,                          -- never deleted: history stays readable
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- one row per dosage change; past rows are never rewritten
  CREATE TABLE treatment_regimens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    treatment_id INTEGER NOT NULL REFERENCES treatments(id),
    effective_from TEXT NOT NULL,              -- YYYY-MM-DD
    dose_qty REAL NOT NULL,
    doses_per_day INTEGER NOT NULL DEFAULT 1,
    frequency TEXT NOT NULL,                   -- daily | weekdays | as_needed
    weekdays TEXT,                             -- '1,3,5' ISO (1 = Monday)
    UNIQUE (treatment_id, effective_from)
  );

  -- check-offs are events; undo stamps undone_at and keeps the row
  CREATE TABLE treatment_doses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    treatment_id INTEGER NOT NULL REFERENCES treatments(id),
    day TEXT NOT NULL,                         -- day the dose counts for
    slot INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'taken',      -- taken | skipped
    qty REAL NOT NULL,                         -- dose at logging time, 0 if skipped
    taken_at TEXT NOT NULL,                    -- ISO time of the tap
    undone_at TEXT,
    note TEXT
  );
  CREATE UNIQUE INDEX idx_treatment_doses_active
    ON treatment_doses(treatment_id, day, slot) WHERE undone_at IS NULL;
  CREATE INDEX idx_treatment_doses_day ON treatment_doses(treatment_id, day);

  CREATE TABLE treatment_stock_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    treatment_id INTEGER NOT NULL REFERENCES treatments(id),
    kind TEXT NOT NULL,                        -- add | set
    qty REAL NOT NULL,
    at TEXT NOT NULL,                          -- ISO
    note TEXT
  );

  INSERT INTO treatments (name, unit, package_size, waste_pct, reminder_time, sort_order) VALUES
    ('Vitamine', 'gélule', 60, 0, '09:00', 1),
    ('Minoxidil', 'ml', 60, 0.1, '21:00', 2),
    ('Finastéride', 'comprimé', 80, 0, '09:00', 3);
  INSERT INTO treatment_regimens (treatment_id, effective_from, dose_qty, doses_per_day, frequency)
    SELECT id, date('now', 'localtime'), CASE unit WHEN 'ml' THEN 2 ELSE 1 END, 1, 'daily' FROM treatments;
  `,
  // 4 — subscriptions, wishlist and monthly savings. Money is integer cents.
  `
  CREATE TABLE subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'autre',
    price_cents INTEGER NOT NULL,
    cycle_unit TEXT NOT NULL,                  -- week | month | year
    cycle_count INTEGER NOT NULL DEFAULT 1,
    anchor_on TEXT NOT NULL,                   -- any billing date (YYYY-MM-DD); renewals derive from it
    trial_ends_on TEXT,
    reminder_days INTEGER NOT NULL DEFAULT 3,
    billing TEXT NOT NULL DEFAULT 'direct',    -- google_play | direct
    cancel_url TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active',     -- active | cancelled
    cancelled_on TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE wishlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    priority INTEGER NOT NULL DEFAULT 2,       -- 1 envie | 2 important | 3 essentiel
    url TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'wanted',     -- wanted | bought | dropped
    cooling_until TEXT,                        -- YYYY-MM-DD, null = no cooling-off
    added_on TEXT NOT NULL,
    closed_on TEXT,                            -- day bought or dropped
    paid_cents INTEGER                         -- actual price when bought
  );

  -- savings balance entered by hand once a month (no bank link)
  CREATE TABLE savings_balances (
    month TEXT PRIMARY KEY,                    -- YYYY-MM
    balance_cents INTEGER NOT NULL,
    recorded_at TEXT NOT NULL
  );

  INSERT INTO settings (key, value) VALUES
    ('wishlist_monthly_goal_cents', '0'),
    ('wishlist_cooling_days', '30');
  `,
  // 5 — monthly hair photo checks (hair care phase 2). Files live in the app's
  // private document directory (hair/…); rows keep paths relative to it.
  `
  CREATE TABLE hair_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,                         -- YYYY-MM-DD the check was started
    notes TEXT,
    side_effects TEXT,                         -- free text, null = nothing reported
    completed_at TEXT,                         -- ISO; null while photos are being taken
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE hair_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    check_id INTEGER NOT NULL REFERENCES hair_checks(id),
    zone TEXT NOT NULL,                        -- frontal | temples | vertex | top
    path TEXT NOT NULL,                        -- full photo, relative to the document directory
    thumb_path TEXT NOT NULL,                  -- small copy for grids
    mean_luma REAL NOT NULL,                   -- 0–255, average over a 64 px thumbnail
    scene_ev REAL,                             -- EXIF exposure (EV at ISO 100), null if the phone gave none
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    taken_at TEXT NOT NULL,                    -- ISO
    UNIQUE (check_id, zone)
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
