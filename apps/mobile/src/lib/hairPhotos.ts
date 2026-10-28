/**
 * Pure logic for the monthly hair photo check (hair care phase 2): zones,
 * brightness from decoded pixels and EXIF, comparison with the zone's first
 * photo, and when the next check is due. No React, no SQLite, no files.
 */
import { diffDays } from "./dates.ts";
import { occurrence } from "./renewals.ts";

export const ZONES = ["frontal", "temples", "vertex", "top"] as const;
export type Zone = (typeof ZONES)[number];

export const ZONE_LABEL: Record<Zone, string> = {
  frontal: "Ligne frontale",
  temples: "Golfes",
  vertex: "Vertex",
  top: "Dessus",
};

/**
 * How each zone is shot. Front and temples: front camera, phone upright,
 * the screen (and the ghost of last month) in view. Vertex and top: back
 * camera held flat above the head, screen out of sight, so a countdown.
 */
export const ZONE_SETUP: Record<Zone, { camera: "front" | "back"; pose: "upright" | "flat"; countdown: number; hint: string }> = {
  frontal: {
    camera: "front",
    pose: "upright",
    countdown: 0,
    hint: "Cheveux tirés en arrière, visage de face, la ligne frontale dans le cadre.",
  },
  temples: {
    camera: "front",
    pose: "upright",
    countdown: 0,
    hint: "Tête légèrement baissée, les deux golfes dans le cadre.",
  },
  vertex: {
    camera: "back",
    pose: "flat",
    countdown: 10,
    hint: "Téléphone à plat au-dessus de l'arrière du crâne, écran vers le plafond.",
  },
  top: {
    camera: "back",
    pose: "flat",
    countdown: 10,
    hint: "Téléphone à plat au-dessus du milieu du crâne, écran vers le plafond.",
  },
};

/** Mean Rec. 709 luma (0–255) of RGBA pixels, alpha ignored. */
export function meanLuma(rgba: ArrayLike<number>): number {
  const pixels = Math.floor(rgba.length / 4);
  if (pixels === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pixels * 4; i += 4) sum += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
  return sum / pixels;
}

/** EXIF numbers come as numbers, "1/50"-style strings or one-item arrays depending on the phone. */
function exifNumber(value: unknown): number | null {
  if (Array.isArray(value)) return exifNumber(value[0]);
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const [num, den] = value.split("/").map(Number);
  const n = den === undefined ? num : num / den;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Scene light as an exposure value at ISO 100 (higher = brighter room).
 * Auto-exposure brings the average pixel back to mid-grey, so the mean luma
 * alone misses a dimmer lamp; exposure time and ISO don't. Null when the
 * phone reports neither. A missing f-number counts as constant (phones have
 * a fixed aperture), which cancels out when two shots are compared.
 */
export function sceneEv(exif: Record<string, unknown> | null | undefined): number | null {
  if (!exif) return null;
  const time = exifNumber(exif.ExposureTime);
  const iso = exifNumber(exif.ISOSpeedRatings ?? exif.PhotographicSensitivity ?? exif.ISO);
  if (!time || !iso) return null;
  const aperture = exifNumber(exif.FNumber) ?? 1;
  return Math.log2((aperture * aperture) / time) - Math.log2(iso / 100);
}

/** Beyond these gaps with the zone's first photo, a retake is offered. */
export const LUMA_TOLERANCE = 0.15;
export const EV_TOLERANCE = 1;

export type Brightness = { luma: number; ev: number | null };
export type BrightnessCheck = {
  ok: boolean;
  /** Relative gap of the mean luma, signed (−0.2 = 20 % darker). */
  lumaDelta: number;
  /** Gap in EV, signed (−1 = half the light); null if either shot has no EXIF. */
  evDelta: number | null;
  message: string;
};

/** Compares a new shot with the zone's first photo (the reference); none yet = this one becomes it. */
export function compareBrightness(shot: Brightness, reference: Brightness | null): BrightnessCheck {
  if (!reference) {
    return { ok: true, lumaDelta: 0, evDelta: null, message: "Première photo de cette zone : elle servira de référence pour la lumière." };
  }
  const lumaDelta = reference.luma > 0 ? (shot.luma - reference.luma) / reference.luma : 0;
  const evDelta = shot.ev !== null && reference.ev !== null ? shot.ev - reference.ev : null;
  const issues: string[] = [];
  if (evDelta !== null && Math.abs(evDelta) > EV_TOLERANCE) {
    issues.push(`la pièce est nettement plus ${evDelta < 0 ? "sombre" : "claire"} qu'à la première photo`);
  }
  if (Math.abs(lumaDelta) > LUMA_TOLERANCE) {
    issues.push(`la photo est ${Math.round(Math.abs(lumaDelta) * 100)} % plus ${lumaDelta < 0 ? "sombre" : "claire"}`);
  }
  if (issues.length === 0) return { ok: true, lumaDelta, evDelta, message: "Lumière comparable à la première photo." };
  const text = issues.join(", et ");
  return { ok: false, lumaDelta, evDelta, message: `${text[0].toUpperCase()}${text.slice(1)}. Même pièce, même lampe, flash éteint ?` };
}

/** The next check is due one calendar month after the last completed one (31 Jan → 28 Feb), or now if none. */
export function nextCheckDue(lastCheckDay: string | null, today: string): string {
  return lastCheckDay ? occurrence(lastCheckDay, { unit: "month", count: 1 }, 1) : today;
}

/** Days past the due date (0 on the day itself), or null while not due yet. */
export function overdueDays(lastCheckDay: string | null, today: string): number | null {
  const late = diffDays(nextCheckDue(lastCheckDay, today), today);
  return late >= 0 ? late : null;
}

/** Day of month for the repeating reminder: the due day, capped at 28 so it exists every month. */
export function reminderDayOfMonth(due: string): number {
  return Math.min(28, Number(due.slice(8, 10)));
}

export type PhotoRef = { id: number; checkId: number; day: string; zone: Zone };

/** The reference for a zone: its very first photo (other than `exceptId`). */
export function firstPhoto<T extends PhotoRef>(photos: T[], zone: Zone, exceptCheckId?: number): T | null {
  return chronological(photos.filter((p) => p.zone === zone && p.checkId !== exceptCheckId))[0] ?? null;
}

/** The ghost for a zone: its most recent photo from an earlier check. */
export function previousPhoto<T extends PhotoRef>(photos: T[], zone: Zone, currentCheckId: number): T | null {
  const earlier = chronological(photos.filter((p) => p.zone === zone && p.checkId < currentCheckId));
  return earlier[earlier.length - 1] ?? null;
}

/** Photos of each zone, oldest first. */
export function byZone<T extends PhotoRef>(photos: T[]): Record<Zone, T[]> {
  return Object.fromEntries(ZONES.map((z) => [z, chronological(photos.filter((p) => p.zone === z))])) as Record<Zone, T[]>;
}

function chronological<T extends PhotoRef>(photos: T[]): T[] {
  return [...photos].sort((a, b) => (a.day === b.day ? a.checkId - b.checkId : a.day < b.day ? -1 : 1));
}
