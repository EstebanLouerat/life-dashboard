/**
 * Today's dashboard layout: which tiles, in which order, at which size.
 * Stored as JSON in settings (`today_tiles`); anything unreadable falls back
 * to the default. Pure.
 */

export const TILE_IDS = ["hydration", "treatments", "sleep", "workout", "dinner", "savings", "hair", "money"] as const;
export type TileId = (typeof TILE_IDS)[number];
export type TileSize = "half" | "large";
export type LayoutEntry = { id: TileId; size: TileSize };

export type TileInfo = {
  title: string;
  /** Domain colour of the tile (see theme). */
  domain: "eau" | "sante" | "sommeil" | "sport" | "courses" | "epargne" | "encre";
  icon: string;
  /** What the tile shows, by size, for the Personnaliser list. */
  describe: Record<TileSize, string>;
  sizes: TileSize[];
};

export const TILES: Record<TileId, TileInfo> = {
  hydration: {
    title: "Hydratation",
    domain: "eau",
    icon: "water-outline",
    describe: { large: "+1 verre et +2 verres", half: "+1 verre" },
    sizes: ["large", "half"],
  },
  treatments: {
    title: "Traitements du jour",
    domain: "sante",
    icon: "medkit-outline",
    describe: { large: "cases et stock", half: "cases" },
    sizes: ["large"],
  },
  sleep: {
    title: "Sommeil",
    domain: "sommeil",
    icon: "moon-outline",
    describe: { large: "nuit et 7 jours", half: "nuit" },
    sizes: ["large"],
  },
  workout: {
    title: "Séance du jour",
    domain: "sport",
    icon: "pulse-outline",
    describe: { large: "blocs et démarrage", half: "blocs et démarrage" },
    sizes: ["half", "large"],
  },
  dinner: {
    title: "Dîner de ce soir",
    domain: "courses",
    icon: "cart-outline",
    describe: { large: "menu et budget", half: "menu et budget" },
    sizes: ["half", "large"],
  },
  savings: {
    title: "Épargne",
    domain: "epargne",
    icon: "gift-outline",
    describe: { large: "objectif en cours", half: "objectif en cours" },
    sizes: ["half", "large"],
  },
  hair: {
    title: "Suivi cheveux",
    domain: "sante",
    icon: "camera-outline",
    describe: { large: "prochaine série photo", half: "prochaine série photo" },
    sizes: ["half", "large"],
  },
  money: {
    title: "À venir",
    domain: "epargne",
    icon: "calendar-outline",
    describe: { large: "prélèvements, essais, solde", half: "prélèvements, essais, solde" },
    sizes: ["large", "half"],
  },
};

export const DEFAULT_LAYOUT: LayoutEntry[] = [
  { id: "hydration", size: "large" },
  { id: "treatments", size: "large" },
  { id: "sleep", size: "large" },
  { id: "workout", size: "half" },
  { id: "dinner", size: "half" },
  { id: "savings", size: "half" },
  { id: "hair", size: "half" },
  { id: "money", size: "large" },
];

const isTile = (v: unknown): v is TileId => typeof v === "string" && (TILE_IDS as readonly string[]).includes(v);

/** Reads the stored layout; unknown tiles and duplicates are dropped, sizes a tile can't take are fixed. */
export function parseLayout(json: string | null | undefined): LayoutEntry[] {
  if (!json) return DEFAULT_LAYOUT;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return DEFAULT_LAYOUT;
  }
  if (!Array.isArray(raw)) return DEFAULT_LAYOUT;
  const seen = new Set<TileId>();
  const out: LayoutEntry[] = [];
  for (const entry of raw) {
    const id = (entry as { id?: unknown })?.id;
    if (!isTile(id) || seen.has(id)) continue;
    seen.add(id);
    const size = (entry as { size?: unknown }).size;
    out.push({ id, size: TILES[id].sizes.includes(size as TileSize) ? (size as TileSize) : TILES[id].sizes[0] });
  }
  return out;
}

export function serializeLayout(layout: LayoutEntry[]): string {
  return JSON.stringify(layout);
}

/** Tiles not on the dashboard, in catalogue order. */
export function availableTiles(layout: LayoutEntry[]): TileId[] {
  const used = new Set(layout.map((e) => e.id));
  return TILE_IDS.filter((id) => !used.has(id));
}

export function moveTile(layout: LayoutEntry[], from: number, to: number): LayoutEntry[] {
  if (from === to || from < 0 || from >= layout.length) return layout;
  const next = [...layout];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, moved);
  return next;
}

/** Rows to draw: a large tile alone, half tiles two by two in reading order. */
export function tileRows(layout: LayoutEntry[]): LayoutEntry[][] {
  const rows: LayoutEntry[][] = [];
  for (const entry of layout) {
    const last = rows[rows.length - 1];
    if (entry.size === "half" && last && last.length === 1 && last[0].size === "half") last.push(entry);
    else rows.push([entry]);
  }
  return rows;
}
