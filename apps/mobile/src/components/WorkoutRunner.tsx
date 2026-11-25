import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WorkoutSession } from "@ld/contracts";
import { haptics } from "@/lib/haptics";
import { buildSteps, goToStep, secondsLeft, togglePause as pauseOrResume, type RunState } from "@/lib/workoutTimeline";

export type Run = RunState & { sessionId: number; session: WorkoutSession };

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

  const goTo = useCallback((r: Run, index: number): Run => goToStep(r, index, Date.now()), []);

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
    setRun((r) => (r ? pauseOrResume(r, Date.now()) : r));
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

  const remaining = run ? secondsLeft(run, now) : 0;

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
