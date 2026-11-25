import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSteps, clock, goToStep, groupBlocks, minutesLeft, secondsLeft, setsLabel, togglePause, type TimedExercise } from "./workoutTimeline.ts";

const ex = (over: Partial<TimedExercise>): TimedExercise => ({
  name: "x",
  block: "mobilite",
  reps: null,
  seconds: 30,
  sets: 1,
  restSeconds: 0,
  cue: "",
  ...over,
});

describe("buildSteps", () => {
  it("adds a rest after each set except the last of the session", () => {
    const steps = buildSteps([ex({ sets: 2, restSeconds: 15 }), ex({ reps: 8, seconds: null, sets: 2, restSeconds: 30 })]);
    assert.deepEqual(
      steps.map((s) => `${s.exercise}.${s.set}${s.kind === "rest" ? "r" : ""}`),
      ["0.1", "0.1r", "0.2", "0.2r", "1.1", "1.1r", "1.2"],
    );
    assert.equal(steps[4].seconds, null);
    assert.equal(steps[4].reps, 8);
  });

  it("skips rests of zero seconds", () => {
    assert.equal(buildSteps([ex({ sets: 3 })]).length, 3);
  });
});

describe("groupBlocks", () => {
  it("keeps block order and rounds durations to at least a minute", () => {
    const blocks = groupBlocks([
      ex({ block: "renfo", reps: 8, seconds: null, sets: 3, restSeconds: 30 }),
      ex({ block: "echauffement", seconds: 30 }),
    ]);
    assert.deepEqual(
      blocks.map((b) => [b.block, b.minutes, b.exercises.map((e) => e.index)]),
      [
        ["echauffement", 1, [1]],
        ["renfo", 2, [0]],
      ],
    );
  });
});

describe("labels", () => {
  it("formats sets, reps and the clock", () => {
    assert.equal(setsLabel({ sets: 2, seconds: 30, reps: null }), "2 × 30 s");
    assert.equal(setsLabel({ sets: 3, seconds: null, reps: 8 }), "3 × 8");
    assert.equal(setsLabel({ sets: 1, seconds: 60, reps: null }), "60 s");
    assert.equal(clock(18), "0:18");
    assert.equal(clock(61.2), "1:02");
    assert.equal(clock(-3), "0:00");
  });

  it("estimates the minutes left", () => {
    const steps = buildSteps([ex({ sets: 2, restSeconds: 30 }), ex({ seconds: 60 })]);
    assert.equal(minutesLeft(steps, 0, 10), 3);
    assert.equal(minutesLeft(steps, steps.length - 1, 5), 1);
  });
});

describe("guided timer", () => {
  const steps = buildSteps([ex({ seconds: 30, sets: 1, restSeconds: 15 }), ex({ reps: 8, seconds: null, sets: 1 })]);
  const start = (now: number) => goToStep({ steps, index: 0, endsAt: null, remainingMs: 0, paused: false, finished: false }, 0, now);

  it("runs a timed step from its end time", () => {
    const r = start(1000);
    assert.equal(r.endsAt, 31_000);
    assert.equal(secondsLeft(r, 11_000), 20);
    assert.equal(secondsLeft(r, 40_000), 0);
  });

  it("keeps the time left across a pause", () => {
    const paused = togglePause(start(0), 12_000);
    assert.equal(paused.endsAt, null);
    assert.equal(secondsLeft(paused, 99_000), 18);
    const resumed = togglePause(paused, 100_000);
    assert.equal(resumed.endsAt, 118_000);
  });

  it("waits on a reps step, then finishes after the last one", () => {
    const reps = goToStep(start(0), 2, 5000);
    assert.equal(steps[2].reps, 8);
    assert.equal(reps.endsAt, null);
    assert.equal(secondsLeft(reps, 9999), 0);
    const done = goToStep(reps, 3, 6000);
    assert.equal(done.finished, true);
    assert.equal(done.index, 2);
    assert.equal(togglePause(done, 7000), done);
  });

  it("stays paused when moving while paused", () => {
    const moved = goToStep(togglePause(start(0), 1000), 1, 2000);
    assert.equal(moved.paused, true);
    assert.equal(moved.endsAt, null);
    assert.equal(secondsLeft(moved, 50_000), 15);
  });
});
