import { useColorScheme, type TextStyle } from "react-native";

/**
 * Design tokens. Every colour used by a screen comes from here, never a raw
 * hex in a component. Pairs were picked for ≥ 4.5:1 text contrast in both
 * modes; `on*` tokens are the foreground to put on a solid fill.
 */
const light = {
  bg: "#F4F5FA",
  surface: "#FFFFFF",
  surfaceAlt: "#EEF0F7",
  text: "#0E1121",
  textMuted: "#5A6078",
  border: "#E3E6F0",
  primary: "#5550D8",
  onPrimary: "#FFFFFF",
  primaryText: "#4B46C8",
  primarySoft: "#ECEBFC",
  success: "#15803D",
  onSuccess: "#FFFFFF",
  successSoft: "#EBF8EF",
  warning: "#92400E",
  onWarning: "#FFFFFF",
  warningSoft: "#FDF0DC",
  danger: "#C62828",
  onDanger: "#FFFFFF",
  dangerSoft: "#FCE7E7",
  shadow: "#1B1F3B",
  heroGradient: ["#4F46E5", "#7C3AED"] as readonly [string, string],
  onHero: "#FFFFFF",
  heroTrack: "rgba(255,255,255,0.25)",
  module: {
    water: { solid: "#0369A1", soft: "#E0F2FE" },
    sleep: { solid: "#7C3AED", soft: "#EFE7FD" },
    care: { solid: "#0F766E", soft: "#DDF6F2" },
    sport: { solid: "#C2410C", soft: "#FFF1E2" },
    groceries: { solid: "#15803D", soft: "#DCFCE7" },
    settings: { solid: "#475569", soft: "#E8ECF2" },
    subs: { solid: "#BE185D", soft: "#FCE7F3" },
    wish: { solid: "#8A5A00", soft: "#FDF3D7" },
  },
};

const dark: typeof light = {
  bg: "#0A0C14",
  surface: "#141724",
  surfaceAlt: "#1C2031",
  text: "#EDEFF7",
  textMuted: "#A0A6BC",
  border: "#262A3D",
  primary: "#5550D8",
  onPrimary: "#FFFFFF",
  primaryText: "#A9A6FF",
  primarySoft: "#232245",
  success: "#4ADE80",
  onSuccess: "#0A0C14",
  successSoft: "#13291D",
  warning: "#FBBF24",
  onWarning: "#0A0C14",
  warningSoft: "#2E2412",
  danger: "#F87171",
  onDanger: "#0A0C14",
  dangerSoft: "#321719",
  shadow: "#000000",
  heroGradient: ["#3730A3", "#6D28D9"] as readonly [string, string],
  onHero: "#FFFFFF",
  heroTrack: "rgba(255,255,255,0.25)",
  module: {
    water: { solid: "#38BDF8", soft: "#0C2635" },
    sleep: { solid: "#A78BFA", soft: "#241A3A" },
    care: { solid: "#2DD4BF", soft: "#0E2925" },
    sport: { solid: "#FB923C", soft: "#33200F" },
    groceries: { solid: "#4ADE80", soft: "#11281A" },
    settings: { solid: "#94A3B8", soft: "#1E2433" },
    subs: { solid: "#F472B6", soft: "#3A1428" },
    wish: { solid: "#FACC15", soft: "#2E2608" },
  },
};

export type Theme = typeof light & { dark: boolean };
export type ModuleColor = keyof typeof light.module;

export function useTheme(): Theme {
  const isDark = useColorScheme() === "dark";
  return isDark ? { ...dark, dark: true } : { ...light, dark: false };
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const font = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
} as const;

/**
 * Tracking follows size: tighter as type grows, slightly open below 14 px.
 * Leading does the reverse (about 1.1 for display, 1.5 for body). Figures
 * that change in place (stats, gauges) use tabular digits so they don't jitter.
 */
export const typography = {
  display: { fontFamily: font.extrabold, fontSize: 32, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontFamily: font.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3, fontVariant: ["tabular-nums"] },
  number: { fontFamily: font.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, fontVariant: ["tabular-nums"] },
  headline: { fontFamily: font.bold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 16, lineHeight: 24 },
  callout: { fontFamily: font.medium, fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: font.medium, fontSize: 13, lineHeight: 18, letterSpacing: 0.1 },
  overline: { fontFamily: font.bold, fontSize: 12, lineHeight: 16, letterSpacing: 0.8, textTransform: "uppercase" },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

export type Tint = ModuleColor | "primary" | "success" | "warning" | "danger";

/** Solid + soft pair for a module or semantic colour. */
export function tint(t: Theme, name: Tint): { solid: string; soft: string } {
  switch (name) {
    case "primary":
      return { solid: t.primaryText, soft: t.primarySoft };
    case "success":
      return { solid: t.success, soft: t.successSoft };
    case "warning":
      return { solid: t.warning, soft: t.warningSoft };
    case "danger":
      return { solid: t.danger, soft: t.dangerSoft };
    default:
      return t.module[name];
  }
}

/**
 * A `#RRGGBB` token with an alpha channel. Gradients fade a colour to its own
 * transparent version: plain "transparent" is transparent black on Android
 * and leaves a grey band.
 */
export function withAlpha(hex: string, alpha: number): string {
  return hex + Math.round(alpha * 255).toString(16).padStart(2, "0");
}

/** Soft elevation in light mode; dark mode relies on tonal surfaces instead. */
export function elevation(t: Theme, level: 1 | 2 = 1) {
  if (t.dark) return {};
  return {
    shadowColor: t.shadow,
    shadowOpacity: level === 1 ? 0.06 : 0.12,
    shadowRadius: level === 1 ? 12 : 20,
    shadowOffset: { width: 0, height: level === 1 ? 4 : 8 },
    elevation: level === 1 ? 2 : 6,
  };
}
