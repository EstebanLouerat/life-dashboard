import { AppState, Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

/** What the ongoing notification and the floating capsule show (see modules/live-session). */
export type SessionView = {
  title: string;
  subtitle: string;
  endsAt: number | null;
  remainingMs: number;
  paused: boolean;
  finished: boolean;
  reps: boolean;
  index: number;
  color: string;
  bubble: boolean;
  url: string;
};

export type SessionAction = "pause" | "next" | "stop" | "expired";

type Native = {
  update(view: SessionView): void;
  stop(): void;
  canDrawOverlays(): boolean;
  openOverlaySettings(): void;
  setAppVisible(visible: boolean): void;
  addListener(event: "onAction", listener: (e: { action: SessionAction; index: number }) => void): { remove(): void };
};

/** Only in a native Android build: Expo Go and the web preview have no such module. */
const native = Platform.OS === "android" ? requireOptionalNativeModule<Native>("LiveSession") : null;

if (native) {
  // The capsule only floats over other apps, never over this one.
  native.setAppVisible(AppState.currentState === "active");
  AppState.addEventListener("change", (state) => native.setAppVisible(state === "active"));
}

export const liveSession = {
  available: !!native,
  update: (view: SessionView) => native?.update(view),
  stop: () => native?.stop(),
  canDrawOverlays: () => native?.canDrawOverlays() ?? false,
  openOverlaySettings: () => native?.openOverlaySettings(),
  onAction: (listener: (action: SessionAction, index: number) => void) =>
    native?.addListener("onAction", (e) => listener(e.action, e.index)),
};
