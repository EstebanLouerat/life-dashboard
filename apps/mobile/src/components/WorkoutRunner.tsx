import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WorkoutSession } from "@ld/contracts";
import { haptics } from "@/lib/haptics";
import { buildSteps, type Step } from "@/lib/workoutTimeline";

export type Run = {
  sessionId: number;
  session: WorkoutSession;
  steps: Step[];
  index: number;
  /** Epoch ms the current timed step ends at while running; null when paused or counted in reps. */
  endsAt: number | null;
  /** Remaining ms of the current timed step while paused. */
  remainingMs: number;
  paused: boolean;
  finished: boolean;
};

type RunnerApi = {
  run: Run | null;
  /** Seconds left in the current step (0 for a reps step). */
  remaining: number;
  start: (sessionId: number, session: WorkoutSession) => void;
  togglePause: () => void;
  next: () => void;
  previous: () => void;
  stop: () => void;
};

const RunnerContext = createContext<RunnerApi | null>(null);

function stepMs(step: Step | undefined): number {
  return step?.seconds != null ? step.seconds * 1000 : 0;
}

/**
 * The session being played, shared by the full-screen timer, the accessory
 * above the tab bar and the Today tile, so leaving the timer never stops it.
 * Timed steps run from an end timestamp (no drift); a reps step waits for
 * "Série faite". Kept in memory only: a killed app ends the session.
 */
export function WorkoutRunnerProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState<Run | null>(null);
  const [now, setNow] = useState(Date.now());
  const runRef = useRef(run);
  runRef.current = run;
  /** Step index already auto-advanced, so two ticks never skip two steps. */
  const advanced = useRef<number | null>(null);

  const goTo = useCallback((r: Run, index: number): Run => {
    if (index >= r.steps.length) return { ...r, index: r.steps.length - 1, endsAt: null, remainingMs: 0, paused: true, finished: true };
    const step = r.steps[Math.max(0, index)];
    const ms = stepMs(step);
    return {
      ...r,
      index: Math.max(0, index),
      remainingMs: ms,
      endsAt: step.seconds != null && !r.paused ? Date.now() + ms : null,
      finished: false,
    };
  }, []);

  const start = useCallback(
    (sessionId: number, session: WorkoutSession) => {
      const current = runRef.current;
      if (current && current.sessionId === sessionId && !current.finished) return;
      const base: Run = { sessionId, session, steps: buildSteps(session.exercises), index: 0, endsAt: null, remainingMs: 0, paused: false, finished: false };
      advanced.current = null;
      setRun(goTo(base, 0));
    },
    [goTo],
  );

  const next = useCallback(() => {
    setRun((r) => {
      if (!r) return r;
      const moved = goTo(r, r.index + 1);
      if (moved.finished) haptics.success();
      else haptics.impact();
      return moved;
    });
  }, [goTo]);

  const previous = useCallback(() => {
    advanced.current = null;
    setRun((r) => (r ? goTo(r, r.index - 1) : r));
    haptics.tap();
  }, [goTo]);

  const togglePause = useCallback(() => {
    haptics.tap();
    setRun((r) => {
      if (!r || r.finished) return r;
      if (r.paused) {
        const step = r.steps[r.index];
        return { ...r, paused: false, endsAt: step.seconds != null ? Date.now() + r.remainingMs : null };
      }
      return { ...r, paused: true, remainingMs: r.endsAt ? Math.max(0, r.endsAt - Date.now()) : r.remainingMs, endsAt: null };
    });
  }, []);

  const stop = useCallback(() => setRun(null), []);

  // Ticks while a timed step runs; moves on by itself at zero.
  useEffect(() => {
    if (!run?.endsAt) return;
    const id = setInterval(() => {
      const r = runRef.current;
      setNow(Date.now());
      if (r?.endsAt && Date.now() >= r.endsAt && advanced.current !== r.index) {
        advanced.current = r.index;
        next();
      }
    }, 250);
    return () => clearInterval(id);
  }, [run?.endsAt, next]);

  const remaining = run ? (run.endsAt ? Math.max(0, (run.endsAt - now) / 1000) : run.remainingMs / 1000) : 0;

  const value = useMemo(
    () => ({ run, remaining, start, togglePause, next, previous, stop }),
    [run, remaining, start, togglePause, next, previous, stop],
  );
  return <RunnerContext.Provider value={value}>{children}</RunnerContext.Provider>;
}

export function useWorkoutRunner(): RunnerApi {
  const ctx = useContext(RunnerContext);
  if (!ctx) throw new Error("useWorkoutRunner outside WorkoutRunnerProvider");
  return ctx;
}
