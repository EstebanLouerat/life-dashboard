/**
 * Guided-timer steps of a workout session, and its blocks. Pure (no React,
 * no SQLite): the runner and the screens read it, `node --test` covers it.
 * Exercises are typed structurally so this file needs no runtime import of
 * @ld/contracts.
 */

export type TimedExercise = {
  name: string;
  block: "echauffement" | "mobilite" | "renfo" | "retour-au-calme";
  reps: number | null;
  seconds: number | null;
  sets: number;
  restSeconds: number;
  cue: string;
};

export type Step = {
  exercise: number;
  /** 1-based set number. */
  set: number;
  sets: number;
  kind: "work" | "rest";
  /** null: a set counted in reps, the user taps "Série faite" to move on. */
  seconds: number | null;
  reps: number | null;
};

export const BLOCK_LABEL: Record<TimedExercise["block"], string> = {
  echauffement: "Échauffement",
  mobilite: "Mobilité",
  renfo: "Renfo",
  "retour-au-calme": "Retour au calme",
};

const BLOCK_ORDER: TimedExercise["block"][] = ["echauffement", "mobilite", "renfo", "retour-au-calme"];

/** Assumed length of one rep, to estimate a block's duration. */
const SECONDS_PER_REP = 3;

/**
 * Each set is a work step; a rest step follows every set that has one,
 * except after the very last set of the session.
 */
export function buildSteps(exercises: TimedExercise[]): Step[] {
  const steps: Step[] = [];
  exercises.forEach((ex, i) => {
    for (let set = 1; set <= ex.sets; set++) {
      steps.push({ exercise: i, set, sets: ex.sets, kind: "work", seconds: ex.seconds, reps: ex.reps });
      const last = i === exercises.length - 1 && set === ex.sets;
      if (ex.restSeconds > 0 && !last) {
        steps.push({ exercise: i, set, sets: ex.sets, kind: "rest", seconds: ex.restSeconds, reps: null });
      }
    }
  });
  return steps;
}

export function exerciseSeconds(ex: TimedExercise): number {
  const work = ex.seconds ?? (ex.reps ?? 0) * SECONDS_PER_REP;
  return ex.sets * work + Math.max(0, ex.sets - 1) * ex.restSeconds;
}

export type Block<T extends TimedExercise = TimedExercise> = {
  block: TimedExercise["block"];
  label: string;
  minutes: number;
  exercises: { index: number; exercise: T }[];
};

/** Exercises grouped by block, in session order, with an approximate duration (≥ 1 min). */
export function groupBlocks<T extends TimedExercise>(exercises: T[]): Block<T>[] {
  return BLOCK_ORDER.map((block) => {
    const list = exercises.map((exercise, index) => ({ index, exercise })).filter((e) => e.exercise.block === block);
    const seconds = list.reduce((sum, e) => sum + exerciseSeconds(e.exercise), 0);
    return { block, label: BLOCK_LABEL[block], minutes: Math.max(1, Math.round(seconds / 60)), exercises: list };
  }).filter((b) => b.exercises.length > 0);
}

/** "2 × 30 s", "3 × 8", "60 s". */
export function setsLabel(ex: Pick<TimedExercise, "sets" | "reps" | "seconds">): string {
  const unit = ex.seconds != null ? `${ex.seconds} s` : `${ex.reps ?? 0}`;
  return ex.sets > 1 ? `${ex.sets} × ${unit}` : unit;
}

/** "0:18" */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Seconds left in the session from step `index` (reps counted at 3 s each), rounded up to minutes. */
export function minutesLeft(steps: Step[], index: number, remainingInStep: number): number {
  let total = remainingInStep;
  for (let i = index + 1; i < steps.length; i++) {
    const s = steps[i];
    total += s.seconds ?? (s.reps ?? 0) * SECONDS_PER_REP;
  }
  return Math.max(1, Math.ceil(total / 60));
}

export type RpeValue = "trop-facile" | "ok" | "dur" | "trop-dur";

/** How a session felt, as the user picks it. */
export const RPE_LABEL: Record<RpeValue, string> = {
  "trop-facile": "Trop facile",
  ok: "OK",
  dur: "Dur",
  "trop-dur": "Trop dur",
};
