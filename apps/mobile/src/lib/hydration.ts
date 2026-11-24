/**
 * The water gauge of Today: at most 12 segments, filled in proportion to
 * the goal, and the glasses still to drink counted from the goal itself
 * (not from the segments, which are capped). Pure.
 */
export function waterGauge(ml: number, goal: number, glass: number): { segments: number; filled: number; left: number } {
  const segments = Math.min(12, Math.max(1, Math.ceil(goal / glass)));
  return {
    segments,
    filled: Math.min(segments, Math.floor((ml / goal) * segments)),
    left: Math.max(0, Math.ceil((goal - ml) / glass)),
  };
}
