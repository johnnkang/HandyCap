/**
 * How many handicap strokes a player gets on a given hole.
 *
 * Strokes are allocated by stroke index: `floor(CH / 18)` on every hole, then
 * one more on the holes indexed `1..(CH mod 18)`.
 *
 * A plus handicap gives strokes back rather than receiving them, starting at
 * the easiest hole (stroke index 18) and working down. This affects at most a
 * couple of holes for a handful of players, and only ever via the net double
 * bogey cap.
 */
export function strokesReceived(courseHandicap: number, strokeIndex: number): number {
  if (courseHandicap === 0) return 0

  if (courseHandicap > 0) {
    const everyHole = Math.floor(courseHandicap / 18)
    const remainder = courseHandicap % 18
    return everyHole + (strokeIndex <= remainder ? 1 : 0)
  }

  const givenBack = -courseHandicap
  const everyHole = Math.floor(givenBack / 18)
  const remainder = givenBack % 18
  const strokes = everyHole + (strokeIndex > 18 - remainder ? 1 : 0)
  // Guard against returning -0, which would render as "-0" in the UI.
  return strokes === 0 ? 0 : -strokes
}
