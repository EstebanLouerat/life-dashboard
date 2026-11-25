import { useEffect, useState, useSyncExternalStore } from "react";
import * as Linking from "expo-linking";
import type { WorkoutSession } from "@ld/contracts";
import { haptics } from "@/lib/haptics";
import { liveSession } from "@/lib/liveSession";
import { buildSteps, goToStep, secondsLeft, togglePause as pauseOrResume, type RunState } from "@/lib/workoutTimeline";
import { refreshWidgets } from "@/widgets/refresh";

export type Run = RunState & { sessionId: number; session: WorkoutSession };

/** Sport accent (light theme): the ongoing notification and the capsule button. */
const SPORT_COLOR = "#A84B24";

/**
 * The session being played. It lives outside React so the timer screen, the
 * accessory, the Today tile, the home-screen widget, the ongoing notification
 * and the floating capsule all drive the same run: leaving the app never
 * stops it. Timed steps run from an end timestamp (no drift); a reps step
 * waits for "Série faite". Kept in memory only: a killed app ends it.
 */
let current: Run | null = null;
let bubble = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function set(next: Run | null) {
  current = next;
  if (timer) clearTimeout(timer);
  timer = null;
  if (next?.endsAt) {
    const index = next.index;
    timer = setTimeout(() => expire(index), Math.max(0, next.endsAt - Date.now()));
  }
  sync(next);
  listeners.forEach((listener) => listener());
}

/** End of a timed step, from the JS timer or from the native one (JS timers pause in the background). */
function expire(index: number) {
  if (current && current.index === index && current.endsAt && Date.now() >= current.endsAt - 250) runner.next();
}

function sync(r: Run | null) {
  refreshWidgets("Workout");
  if (!r) {
    liveSession.stop();
    return;
  }
  const step = r.steps[r.index];
  const exercises = r.session.exercises;
  const ex = exercises[step.exercise];
  const following = exercises[r.steps[r.index + 1]?.exercise ?? -1];
  const position = `exercice ${step.exercise + 1}/${exercises.length}`;
  liveSession.update({
    title: r.finished ? "Séance terminée" : step.kind === "rest" ? `Repos${following && following !== ex ? ` · ensuite ${following.name}` : ""}` : ex.name,
    subtitle: r.finished
      ? `${r.session.title} · note ton ressenti`
      : step.seconds == null
        ? `${step.reps ?? ""} répétitions · série ${step.set}/${step.sets} · ${position}`
        : `Série ${step.set}/${step.sets} · ${position}`,
    endsAt: r.endsAt,
    remainingMs: r.remainingMs,
    paused: r.paused,
    finished: r.finished,
    reps: step.kind === "work" && step.seconds == null,
    index: r.index,
    color: SPORT_COLOR,
    bubble,
    url: Linking.createURL(r.finished ? "/seance/ressenti" : "/seance"),
  });
}

export const runner = {
  get: () => current,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Starts `session`, unless it is the one already running. */
  start(sessionId: number, session: WorkoutSession) {
    if (current && current.sessionId === sessionId && !current.finished) return;
    const base: Run = { sessionId, session, steps: buildSteps(session.exercises), index: 0, endsAt: null, remainingMs: 0, paused: false, finished: false };
    set(goToStep(base, 0, Date.now()));
  },
  next() {
    if (!current) return;
    const moved = goToStep(current, current.index + 1, Date.now());
    if (moved.finished) haptics.success();
    else haptics.impact();
    set(moved);
  },
  previous() {
    if (!current) return;
    haptics.tap();
    set(goToStep(current, current.index - 1, Date.now()));
  },
  togglePause() {
    if (!current) return;
    haptics.tap();
    set(pauseOrResume(current, Date.now()));
  },
  stop() {
    set(null);
  },
  /** Réglages › capsule flottante: applied to the running session at once. */
  setBubble(enabled: boolean) {
    bubble = enabled;
    if (current) sync(current);
  },
};

// Taps on the notification and the capsule, and the native end-of-step timer.
liveSession.onAction((action, index) => {
  if (action === "pause") runner.togglePause();
  else if (action === "next") runner.next();
  else if (action === "stop") runner.stop();
  else if (action === "expired") expire(index);
});

type RunnerApi = {
  run: Run | null;
  /** Seconds left in the current step (0 for a reps step). */
  remaining: number;
  start: typeof runner.start;
  togglePause: typeof runner.togglePause;
  next: typeof runner.next;
  previous: typeof runner.previous;
  stop: typeof runner.stop;
};

/** The run, re-rendered at every change and four times a second while a timed step runs. */
export function useWorkoutRunner(): RunnerApi {
  const run = useSyncExternalStore(runner.subscribe, runner.get);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!run?.endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [run?.endsAt]);
  return {
    run,
    remaining: run ? secondsLeft(run, now) : 0,
    start: runner.start,
    togglePause: runner.togglePause,
    next: runner.next,
    previous: runner.previous,
    stop: runner.stop,
  };
}
