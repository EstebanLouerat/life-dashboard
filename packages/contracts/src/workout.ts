import { z } from "zod";

export const Rpe = z.enum(["trop-facile", "ok", "dur", "trop-dur"]);
export type Rpe = z.infer<typeof Rpe>;

/** Feedback the user gave after a past session. Drives progression. */
export const SessionFeedback = z.object({
  date: z.string(), // YYYY-MM-DD
  rpe: Rpe,
  note: z.string().max(300).optional(),
});
export type SessionFeedback = z.infer<typeof SessionFeedback>;

/** What the app sends to POST /api/workout. */
export const WorkoutRequest = z.object({
  minutes: z.number().int().min(5).max(30).default(10),
  focus: z.enum(["mobilite", "renfo", "mixte"]).default("mixte"),
  /** Current level in plain words, e.g. "10 pompes sur genoux". */
  level: z.string().max(300).optional(),
  /** Pains or injuries to work around. */
  constraints: z.string().max(300).optional(),
  /** Most recent first, max 7. */
  history: z.array(SessionFeedback).max(7).default([]),
});
export type WorkoutRequest = z.infer<typeof WorkoutRequest>;

export const Exercise = z.object({
  name: z.string(),
  block: z.enum(["echauffement", "mobilite", "renfo", "retour-au-calme"]),
  /** Either reps or seconds is set. */
  reps: z.number().int().positive().nullable(),
  seconds: z.number().int().positive().nullable(),
  sets: z.number().int().positive(),
  restSeconds: z.number().int().nonnegative(),
  cue: z.string(),
  /** Why this one: target for capoeira (ginga, au, queixada...). */
  capoeiraLink: z.string().nullable(),
});
export type Exercise = z.infer<typeof Exercise>;

/** What Claude returns and the app plays with a guided timer. */
export const WorkoutSession = z.object({
  title: z.string(),
  totalMinutes: z.number().int().positive(),
  progressionNote: z.string(),
  exercises: z.array(Exercise).min(3),
});
export type WorkoutSession = z.infer<typeof WorkoutSession>;
