import { createContext, createElement, useContext, type ReactNode } from "react";
import { useColorScheme, type TextStyle } from "react-native";

/**
 * Design tokens ("Carnet calme × Liquid Glass"). Warm paper and deep ink for
 * everything neutral, one colour per domain (water blue, health green, sleep
 * indigo, sport orange, groceries amber, savings raspberry), each declined in
 * the same tokens for light and dark. Every text / fill pair passes AA.
 * Screens never use a raw hex: they read the theme, or the accent of the
 * domain they sit in (see DomainScope / useAccent).
 */
export type Domain = "encre" | "eau" | "sante" | "sommeil" | "sport" | "courses" | "epargne";

export type DomainTokens = {
  /** Solid fill of the main action, gauges, checked boxes. */
  accent: string;
  /** Accent used as text on the app background or a surface. */
  accentText: string;
  /** Foreground on `accent`. */
  onAccent: string;
  /** Foreground on `surfaceAccent`. */
  onAccentSoft: string;
  /** Soft fill: secondary buttons, selected chips, icon lenses. */
  surfaceAccent: string;
  /** Translucent tint behind a small icon on glass. */
  lensTint: string;
  /** Colour washed behind the screen header and the dashboard tiles. */
  tint: string;
  tint2: string;
  /** Glass tile fill: the domain tint mixed into frosted glass. */
  tile: string;
};

type Rgba = [number, number, number, number];

function parse(color: string): Rgba {
  if (color.startsWith("#")) {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const [r, g, b, a = "1"] = color.replace(/rgba?\(|\)/g, "").split(",");
  return [Number(r), Number(g), Number(b), Number(a)];
}

/** CSS `color-mix(in srgb, a p%, b)` with alpha (premultiplied), as the design specifies tiles. */
function mix(a: string, p: number, b: string): string {
  const [ar, ag, ab, aa] = parse(a);
  const [br, bg, bb, ba] = parse(b);
  const alpha = aa * p + ba * (1 - p);
  const ch = (x: number, y: number) => Math.round((x * aa * p + y * ba * (1 - p)) / alpha);
  return `rgba(${ch(ar, br)},${ch(ag, bg)},${ch(ab, bb)},${alpha.toFixed(3)})`;
}

type DomainBase = Omit<DomainTokens, "tile">;

function domains(base: Record<Domain, DomainBase>, glassStrong: string): Record<Domain, DomainTokens> {
  return Object.fromEntries(
    Object.entries(base).map(([k, v]) => [k, { ...v, tile: mix(v.tint, 0.3, glassStrong) }]),
  ) as Record<Domain, DomainTokens>;
}

const LIGHT_GLASS_STRONG = "rgba(255,255,255,0.76)";
const DARK_GLASS_STRONG = "rgba(34,40,37,0.8)";

const light = {
  bg: "#F5F3EE",
  surface: "#FFFFFF",
  surfaceAlt: "#ECE9E2",
  text: "#1B1F1D",
  textMuted: "#4F5652",
  textSubtle: "#646B67",
  border: "#E0DCD3",
  borderStrong: "#8C928E",
  inverse: "#2B302E",
  onInverse: "#F1F3F1",
  inverseAction: "#A7DCC8",
  scrim: "rgba(20,24,22,0.28)",
  warning: "#7A4F00",
  warningSoft: "#F8ECD2",
  danger: "#9B2F22",
  dangerSoft: "#F7E1DC",
  /** Frosted glass for floating chrome (bars, round buttons, sheets, snackbar). */
  glass: "rgba(255,255,255,0.86)",
  glassStrong: LIGHT_GLASS_STRONG,
  /** Top-left highlight of glass, fading out at 42 %. */
  glassSpec: "rgba(255,255,255,0.55)",
  glassRim: "inset 1px 1px 0 rgba(255,255,255,0.9), inset -1px -1px 0 rgba(255,255,255,0.45)",
  glassShadow: "0 12px 32px rgba(27,31,29,0.14), 0 2px 8px rgba(27,31,29,0.08)",
  cardShadow: "0 1px 2px rgba(27,31,29,0.04), 0 8px 24px rgba(27,31,29,0.05)",
  /** The lens: the raised selection inside glass (active tab, segment, switch thumb). */
  lens: "rgba(255,255,255,0.82)",
  lensRim: "inset 1px 1px 0 rgba(255,255,255,1), inset -1px -1px 0 rgba(27,31,29,0.06), 0 2px 8px rgba(27,31,29,0.12)",
  track: "rgba(27,31,29,0.08)",
  thumb: "#FFFFFF",
  thumbShadow: "0 2px 6px rgba(0,0,0,0.18)",
  /** Over a camera preview or a photo: same in both modes. */
  media: {
    bg: "#0B0D0C",
    fg: "#FFFFFF",
    muted: "rgba(255,255,255,0.75)",
    scrim: "rgba(0,0,0,0.55)",
    guide: "rgba(255,255,255,0.9)",
    glass: "rgba(24,28,26,0.46)",
    edge: "rgba(255,255,255,0.18)",
    /** Status colours readable on the always-dark viewfinder. */
    ok: "#85C9B1",
    okSoft: "#1E3A31",
    warn: "#EBC173",
    warnSoft: "#3A2D12",
  },
  domain: domains(
    {
      encre: {
        accent: "#33424D", accentText: "#33424D", onAccent: "#FFFFFF", onAccentSoft: "#1F2A31",
        surfaceAccent: "#E1E6EA", lensTint: "rgba(51,66,77,0.14)", tint: "#D9E2E7", tint2: "#E5E8E6",
      },
      eau: {
        accent: "#2E6DAE", accentText: "#2A64A0", onAccent: "#FFFFFF", onAccentSoft: "#1B4573",
        surfaceAccent: "#DCE9F7", lensTint: "rgba(46,109,174,0.14)", tint: "#CFE2F6", tint2: "#E2ECF5",
      },
      sante: {
        accent: "#2D6A57", accentText: "#2D6A57", onAccent: "#FFFFFF", onAccentSoft: "#1D4A3C",
        surfaceAccent: "#DDEBE4", lensTint: "rgba(45,106,87,0.14)", tint: "#CFE6DA", tint2: "#E3EEDF",
      },
      sommeil: {
        accent: "#5A4AA8", accentText: "#54459E", onAccent: "#FFFFFF", onAccentSoft: "#352A75",
        surfaceAccent: "#E5E1F7", lensTint: "rgba(90,74,168,0.14)", tint: "#DED8F5", tint2: "#E8E4F2",
      },
      sport: {
        accent: "#A84B24", accentText: "#9C4421", onAccent: "#FFFFFF", onAccentSoft: "#6E2E14",
        surfaceAccent: "#F8E1D6", lensTint: "rgba(168,75,36,0.14)", tint: "#F5D2C3", tint2: "#F1E2D6",
      },
      courses: {
        accent: "#7A5C00", accentText: "#705400", onAccent: "#FFFFFF", onAccentSoft: "#4F3C00",
        surfaceAccent: "#F4E9C4", lensTint: "rgba(122,92,0,0.14)", tint: "#F2E3B4", tint2: "#F1EAD0",
      },
      epargne: {
        accent: "#A23863", accentText: "#97335C", onAccent: "#FFFFFF", onAccentSoft: "#6B1F3E",
        surfaceAccent: "#F6DDE7", lensTint: "rgba(162,56,99,0.14)", tint: "#F0D1DD", tint2: "#EEE0E6",
      },
    },
    LIGHT_GLASS_STRONG,
  ),
};

const dark: typeof light = {
  bg: "#111413",
  surface: "#1A1E1C",
  surfaceAlt: "#252A28",
  text: "#E8ECE9",
  textMuted: "#B3BAB6",
  textSubtle: "#9AA19D",
  border: "#2F3532",
  borderStrong: "#6F7672",
  inverse: "#E3E7E4",
  onInverse: "#1A1E1C",
  inverseAction: "#2D6A57",
  scrim: "rgba(0,0,0,0.5)",
  warning: "#EBC173",
  warningSoft: "#3A2D12",
  danger: "#F2A194",
  dangerSoft: "#3E1F1A",
  glass: "rgba(34,40,37,0.9)",
  glassStrong: DARK_GLASS_STRONG,
  glassSpec: "rgba(255,255,255,0.16)",
  glassRim: "inset 1px 1px 0 rgba(255,255,255,0.3), inset -1px -1px 0 rgba(255,255,255,0.08)",
  glassShadow: "0 12px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35)",
  cardShadow: "none",
  lens: "rgba(255,255,255,0.18)",
  lensRim: "inset 1px 1px 0 rgba(255,255,255,0.35), inset -1px -1px 0 rgba(255,255,255,0.06), 0 2px 8px rgba(0,0,0,0.3)",
  track: "rgba(232,236,233,0.12)",
  thumb: "#F4F6F5",
  thumbShadow: "0 2px 6px rgba(0,0,0,0.4)",
  media: light.media,
  domain: domains(
    {
      encre: {
        accent: "#C9D3DA", accentText: "#C9D3DA", onAccent: "#1A2329", onAccentSoft: "#E2E8EC",
        surfaceAccent: "#2A3238", lensTint: "rgba(201,211,218,0.2)", tint: "#1F2A30", tint2: "#232828",
      },
      eau: {
        accent: "#86B6E8", accentText: "#8DBBEA", onAccent: "#0B2440", onAccentSoft: "#CFE3F7",
        surfaceAccent: "#1C3550", lensTint: "rgba(134,182,232,0.2)", tint: "#16314A", tint2: "#1B2A38",
      },
      sante: {
        accent: "#85C9B1", accentText: "#85C9B1", onAccent: "#0D2A21", onAccentSoft: "#C3E6D8",
        surfaceAccent: "#1E3A31", lensTint: "rgba(133,201,177,0.2)", tint: "#16362B", tint2: "#1B2E2A",
      },
      sommeil: {
        accent: "#ADA4F2", accentText: "#B3ABF2", onAccent: "#1E1748", onAccentSoft: "#DDD8FA",
        surfaceAccent: "#2C2850", lensTint: "rgba(173,164,242,0.2)", tint: "#262247", tint2: "#232235",
      },
      sport: {
        accent: "#F0A07A", accentText: "#F2AA88", onAccent: "#3A1606", onAccentSoft: "#F8D5C4",
        surfaceAccent: "#44281C", lensTint: "rgba(240,160,122,0.2)", tint: "#3D241A", tint2: "#30241F",
      },
      courses: {
        accent: "#E6C97E", accentText: "#E8CC85", onAccent: "#3A2C05", onAccentSoft: "#F3E4B8",
        surfaceAccent: "#3A3118", lensTint: "rgba(230,201,126,0.2)", tint: "#38301A", tint2: "#2E2A1F",
      },
      epargne: {
        accent: "#F095BA", accentText: "#F29BBE", onAccent: "#45102A", onAccentSoft: "#F8D0E0",
        surfaceAccent: "#452033", lensTint: "rgba(240,149,186,0.2)", tint: "#3B1E28", tint2: "#2D2226",
      },
    },
    DARK_GLASS_STRONG,
  ),
};

export type Theme = typeof light & { dark: boolean };

export function useTheme(): Theme {
  const isDark = useColorScheme() === "dark";
  return isDark ? { ...dark, dark: true } : { ...light, dark: false };
}

const DomainContext = createContext<Domain>("encre");

/**
 * Sets the domain of everything inside: buttons, chips, switches, gauges and
 * the header wash take its accent. A screen sets it once (Screen `domain`);
 * a tile or a row from another domain wraps itself.
 */
export function DomainScope({ domain, children }: { domain: Domain; children: ReactNode }) {
  return createElement(DomainContext.Provider, { value: domain }, children);
}

export function useDomain(): Domain {
  return useContext(DomainContext);
}

/** Accent tokens of the surrounding domain, or of `domain` when given. */
export function useAccent(domain?: Domain): DomainTokens {
  const t = useTheme();
  const current = useDomain();
  return t.domain[domain ?? current];
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

/** Concentric radii inside the phone's 40 px corners: cards 24, tiles 26, sheets 32. */
export const radius = { sm: 8, md: 12, lg: 24, tile: 26, xl: 32, pill: 999 } as const;

/**
 * Roboto, the Android system font, in three weights (300, 400, 500): no font
 * file to load. Tracking tightens as type grows and opens below 14 px.
 * Figures that change in place use tabular digits so they don't jitter.
 */
export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: "500", letterSpacing: -0.6 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "500", letterSpacing: -0.3, fontVariant: ["tabular-nums"] },
  number: { fontSize: 36, lineHeight: 42, fontWeight: "500", letterSpacing: -0.6, fontVariant: ["tabular-nums"] },
  timer: { fontSize: 80, lineHeight: 84, fontWeight: "300", letterSpacing: -2, fontVariant: ["tabular-nums"] },
  headline: { fontSize: 18, lineHeight: 24, fontWeight: "500", letterSpacing: -0.1 },
  nav: { fontSize: 16, lineHeight: 22, fontWeight: "500" },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: "500" },
  callout: { fontSize: 14, lineHeight: 20, fontWeight: "400", letterSpacing: 0.1 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "500", letterSpacing: 0.1 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400", letterSpacing: 0.2 },
  captionStrong: { fontSize: 12, lineHeight: 16, fontWeight: "500", letterSpacing: 0.2 },
  tab: { fontSize: 11, lineHeight: 14, fontWeight: "500", letterSpacing: 0.1 },
  overline: { fontSize: 11, lineHeight: 16, fontWeight: "500", letterSpacing: 0.8, textTransform: "uppercase" },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

export type Tint = Domain | "warning" | "danger";

/** Solid (text, icon) + soft (fill) pair for a domain or a status. */
export function tint(t: Theme, name: Tint): { solid: string; soft: string } {
  if (name === "warning") return { solid: t.warning, soft: t.warningSoft };
  if (name === "danger") return { solid: t.danger, soft: t.dangerSoft };
  const d = t.domain[name];
  return { solid: d.accentText, soft: d.surfaceAccent };
}

/**
 * A `#RRGGBB` token with an alpha channel. Gradients fade a colour to its own
 * transparent version: plain "transparent" is transparent black on Android
 * and leaves a grey band.
 */
export function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith("#")) {
    const [r, g, b] = parse(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return hex + Math.round(alpha * 255).toString(16).padStart(2, "0");
}

/** Plain cards: a soft shadow in light mode; dark mode relies on tonal surfaces. */
export function elevation(t: Theme) {
  return t.dark ? {} : { boxShadow: t.cardShadow };
}

/** Floating glass: shadow under it, highlight rim inside it. */
export function glassShadow(t: Theme) {
  return { boxShadow: `${t.glassShadow}, ${t.glassRim}` };
}
