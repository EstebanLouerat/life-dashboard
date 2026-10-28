import type { SQLiteDatabase } from "expo-sqlite";
import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { decode } from "jpeg-js";
import { today } from "@/lib/dates";
import { CHANNEL_TREATMENTS, cancelScheduled, scheduleMonthly } from "@/lib/notifications";
import {
  meanLuma,
  nextCheckDue,
  overdueDays,
  reminderDayOfMonth,
  sceneEv,
  type Brightness,
  type Zone,
} from "@/lib/hairPhotos";

/**
 * Monthly hair photo checks: storage, brightness reading and reminder.
 * Photos are moved from the camera's cache into the app's private document
 * directory (hair/…), never the gallery; with android.allowBackup off they
 * don't reach Google Drive either. Nothing here leaves the phone.
 */

const DIR = "hair";
const REMINDER_ID = "hair-check";

export type HairPhoto = {
  id: number;
  checkId: number;
  day: string;
  zone: Zone;
  uri: string;
  thumbUri: string;
  luma: number;
  ev: number | null;
  width: number;
  height: number;
  takenAt: string;
};

export type HairCheck = {
  id: number;
  day: string;
  notes: string | null;
  sideEffects: string | null;
  completedAt: string | null;
  photos: HairPhoto[];
};

export type HairState = {
  /** Newest first. */
  checks: HairCheck[];
  photos: HairPhoto[];
  /** A check started but not finished, to resume. */
  open: HairCheck | null;
  lastDay: string | null;
  due: string;
  /** Days past due (0 = due today), null while not due. */
  overdue: number | null;
};

type CheckRow = { id: number; day: string; notes: string | null; side_effects: string | null; completed_at: string | null };
type PhotoRow = {
  id: number;
  check_id: number;
  day: string;
  zone: Zone;
  path: string;
  thumb_path: string;
  mean_luma: number;
  scene_ev: number | null;
  width: number;
  height: number;
  taken_at: string;
};

const fileAt = (path: string) => new File(Paths.document, path);

export async function loadHairState(db: SQLiteDatabase): Promise<HairState> {
  const checkRows = await db.getAllAsync<CheckRow>(
    "SELECT id, day, notes, side_effects, completed_at FROM hair_checks ORDER BY day DESC, id DESC",
  );
  const photoRows = await db.getAllAsync<PhotoRow>(
    `SELECT p.id, p.check_id, c.day, p.zone, p.path, p.thumb_path, p.mean_luma, p.scene_ev, p.width, p.height, p.taken_at
       FROM hair_photos p JOIN hair_checks c ON c.id = p.check_id`,
  );
  const photos: HairPhoto[] = photoRows.map((r) => ({
    id: r.id,
    checkId: r.check_id,
    day: r.day,
    zone: r.zone,
    uri: fileAt(r.path).uri,
    thumbUri: fileAt(r.thumb_path).uri,
    luma: r.mean_luma,
    ev: r.scene_ev,
    width: r.width,
    height: r.height,
    takenAt: r.taken_at,
  }));
  const checks: HairCheck[] = checkRows.map((r) => ({
    id: r.id,
    day: r.day,
    notes: r.notes,
    sideEffects: r.side_effects,
    completedAt: r.completed_at,
    photos: photos.filter((p) => p.checkId === r.id),
  }));
  const lastDay = checks.find((c) => c.completedAt)?.day ?? null;
  const day = today();
  return {
    checks,
    photos,
    open: checks.find((c) => !c.completedAt) ?? null,
    lastDay,
    due: nextCheckDue(lastDay, day),
    overdue: overdueDays(lastDay, day),
  };
}

let reminderSynced = false;

/**
 * Loads the state and keeps the monthly reminder (stable id) on the due
 * day: once per app run, and again whenever `reminder` is set (a check was
 * completed). No reminder before the first check; Today's banner covers it.
 */
export async function refreshHairChecks(db: SQLiteDatabase, opts: { reminder?: boolean } = {}): Promise<HairState> {
  const state = await loadHairState(db);
  if (opts.reminder || !reminderSynced) {
    reminderSynced = true;
    if (state.lastDay) {
      await scheduleMonthly(
        REMINDER_ID,
        "Check photo du mois",
        "4 photos, même pièce et même lumière que la dernière fois.",
        reminderDayOfMonth(state.due),
        10,
        0,
        CHANNEL_TREATMENTS,
      );
    } else {
      await cancelScheduled([REMINDER_ID]);
    }
  }
  return state;
}

/** Resumes the unfinished check, or starts one today. */
export async function startCheck(db: SQLiteDatabase): Promise<number> {
  const open = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM hair_checks WHERE completed_at IS NULL ORDER BY id DESC LIMIT 1",
  );
  if (open) return open.id;
  const res = await db.runAsync("INSERT INTO hair_checks (day) VALUES (?)", today());
  return res.lastInsertRowId;
}

/**
 * Mean luma from a 64 px wide copy decoded in JS (no native pixel access in
 * Expo Go), plus the scene exposure from EXIF.
 */
export async function analyzeShot(uri: string, exif?: Record<string, unknown> | null): Promise<Brightness> {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: 64 }).renderAsync();
  const small = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  const file = new File(small.uri);
  try {
    const { data } = decode(await file.bytes(), { useTArray: true, formatAsRGBA: true });
    return { luma: meanLuma(data), ev: sceneEv(exif) };
  } finally {
    deleteQuietly(file);
  }
}

/** A shot the user chose to retake: only ever in the camera cache. */
export function discardShot(uri: string): void {
  deleteQuietly(new File(uri));
}

/**
 * Keeps a shot for a zone: a 360 px thumbnail for grids, then the full photo
 * moved out of the cache. A retake replaces the zone's row and files.
 */
export async function savePhoto(
  db: SQLiteDatabase,
  checkId: number,
  zone: Zone,
  shot: { uri: string; width: number; height: number },
  brightness: Brightness,
): Promise<void> {
  const dir = new Directory(Paths.document, DIR);
  dir.create({ idempotent: true, intermediates: true });
  // A new name on every save, so a retake never shows a cached older image.
  const name = `${checkId}-${zone}-${Date.now()}`;
  const path = `${DIR}/${name}.jpg`;
  const thumbPath = `${DIR}/${name}-thumb.jpg`;

  const thumbRef = await ImageManipulator.manipulate(shot.uri).resize({ width: 360 }).renderAsync();
  const thumb = await thumbRef.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  await new File(thumb.uri).move(fileAt(thumbPath));
  await new File(shot.uri).move(fileAt(path));

  const previous = await db.getFirstAsync<{ path: string; thumb_path: string }>(
    "SELECT path, thumb_path FROM hair_photos WHERE check_id = ? AND zone = ?",
    checkId,
    zone,
  );
  await db.runAsync(
    `INSERT INTO hair_photos (check_id, zone, path, thumb_path, mean_luma, scene_ev, width, height, taken_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (check_id, zone) DO UPDATE SET
       path = excluded.path, thumb_path = excluded.thumb_path, mean_luma = excluded.mean_luma,
       scene_ev = excluded.scene_ev, width = excluded.width, height = excluded.height, taken_at = excluded.taken_at`,
    checkId,
    zone,
    path,
    thumbPath,
    brightness.luma,
    brightness.ev,
    shot.width,
    shot.height,
    new Date().toISOString(),
  );
  if (previous) {
    deleteQuietly(fileAt(previous.path));
    deleteQuietly(fileAt(previous.thumb_path));
  }
}

/** Finishes a check (even with zones skipped) and moves the reminder to next month. */
export async function completeCheck(db: SQLiteDatabase, checkId: number, notes: string, sideEffects: string): Promise<void> {
  await db.runAsync(
    "UPDATE hair_checks SET notes = ?, side_effects = ?, completed_at = ? WHERE id = ?",
    notes.trim() || null,
    sideEffects.trim() || null,
    new Date().toISOString(),
    checkId,
  );
  await refreshHairChecks(db, { reminder: true });
}

/** Abandons a check: its photos are deleted from the phone along with the rows. */
export async function discardCheck(db: SQLiteDatabase, checkId: number): Promise<void> {
  const rows = await db.getAllAsync<{ path: string; thumb_path: string }>(
    "SELECT path, thumb_path FROM hair_photos WHERE check_id = ?",
    checkId,
  );
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM hair_photos WHERE check_id = ?", checkId);
    await db.runAsync("DELETE FROM hair_checks WHERE id = ?", checkId);
  });
  for (const r of rows) {
    deleteQuietly(fileAt(r.path));
    deleteQuietly(fileAt(r.thumb_path));
  }
}

function deleteQuietly(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    // Already gone: nothing to clean up.
  }
}
