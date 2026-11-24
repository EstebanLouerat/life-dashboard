import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { haptics } from "@/lib/haptics";
import { GlassSpecular, PillButton } from "./controls";
import { EASE_IN, EASE_OUT } from "./motion";
import { Icon, Txt } from "./primitives";
import { glassShadow, radius, space, useAccent, useTheme } from "./theme";

/** How long the snackbar offers its action. */
const VISIBLE_MS = 6000;

export type Undoable = {
  /** What just happened: "1 verre ajouté · 1 500 ml". */
  message: string;
  undo: () => unknown;
  /** Replays the action after an undo; without it the snackbar only says "Annulé". */
  redo?: () => unknown;
};

type Snack = { kind: "done" | "undone"; message: string; action: Undoable; key: number };

type SnackbarApi = { show: (action: Undoable) => void; snack: Snack | null; act: () => void };

const SnackbarContext = createContext<SnackbarApi | null>(null);

/**
 * One snackbar for the tab screens. A one-tap log shows it with "Annuler"
 * for 6 s; after an undo it says "Annulé" and offers "Rétablir". The host
 * (in the tab bar) draws it above the bar.
 */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [snack, setSnack] = useState<Snack | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const present = useCallback((kind: Snack["kind"], message: string, action: Undoable) => {
    if (timer.current) clearTimeout(timer.current);
    seq.current += 1;
    setSnack({ kind, message, action, key: seq.current });
    AccessibilityInfo.announceForAccessibility(message);
    timer.current = setTimeout(() => setSnack(null), VISIBLE_MS);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const show = useCallback((action: Undoable) => present("done", action.message, action), [present]);

  const act = useCallback(async () => {
    if (!snack) return;
    haptics.impact();
    const { action, kind } = snack;
    if (kind === "done") {
      await action.undo();
      if (action.redo) present("undone", "Annulé", action);
      else setSnack(null);
    } else if (action.redo) {
      await action.redo();
      present("done", "Rétabli", action);
    }
  }, [snack, present]);

  const value = useMemo(() => ({ show, snack, act }), [show, snack, act]);
  return <SnackbarContext.Provider value={value}>{children}</SnackbarContext.Provider>;
}

/** `show({ message, undo, redo })` after a one-tap log. A no-op outside the tabs. */
export function useSnackbar(): { show: (action: Undoable) => void } {
  const ctx = useContext(SnackbarContext);
  return { show: ctx?.show ?? (() => {}) };
}

/** Draws the current snackbar; placed by the tab bar just above itself. */
export function SnackbarHost() {
  const ctx = useContext(SnackbarContext);
  const t = useTheme();
  const a = useAccent();
  const p = useSharedValue(0);
  const [shown, setShown] = useState<Snack | null>(null);
  const snack = ctx?.snack ?? null;

  useEffect(() => {
    if (snack) {
      setShown(snack);
      p.value = withTiming(1, { duration: 260, easing: EASE_OUT });
    } else {
      // Unmounted once faded out, so a screen reader can't reach a hidden message or its button.
      p.value = withTiming(0, { duration: 180, easing: EASE_IN }, (done) => {
        if (done) scheduleOnRN(setShown, null);
      });
    }
  }, [snack, p]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 28 }, { scale: 0.92 + p.value * 0.08 }],
  }));

  if (!shown) return null;
  const label = shown.kind === "done" ? "Annuler" : "Rétablir";
  const hasAction = shown.kind === "done" || !!shown.action.redo;
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      importantForAccessibility={snack ? "auto" : "no-hide-descendants"}
      accessibilityElementsHidden={!snack}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: space.md,
          minHeight: 52,
          paddingLeft: space.lg,
          paddingRight: 4,
          paddingVertical: 2,
          borderRadius: 26,
          backgroundColor: t.glass,
          pointerEvents: snack ? "auto" : "none",
        },
        glassShadow(t),
        style,
      ]}
    >
      <GlassSpecular radius={26} />
      <Icon name={shown.kind === "done" ? "checkmark" : "arrow-undo"} size={20} color={t.text} />
      <View style={{ flex: 1 }}>
        <Txt variant="callout" numberOfLines={2}>
          {shown.message}
        </Txt>
      </View>
      {hasAction ? <PillButton label={label} onPress={() => ctx?.act()} color={a.accentText} background={t.lens} /> : null}
    </Animated.View>
  );
}
