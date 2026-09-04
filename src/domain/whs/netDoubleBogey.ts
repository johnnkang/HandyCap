import { strokesReceived } from './strokes'
import type { HoleInfo, HoleScore } from './types'

/** Maximum score for a player who has not yet established a Handicap Index. */
const PROVISIONAL_MAX_OVER_PAR = 5

/**
 * The most a hole can count for handicap purposes: par + 2 + strokes received.
 *
 * Pass `courseHandicap: null` for a player without an established Handicap
 * Index, where the Rules cap every hole at par + 5 instead.
 */
export function maxHoleScore(
  par: number,
  strokeIndex: number,
  courseHandicap: number | null,
): number {
  if (courseHandicap === null) return par + PROVISIONAL_MAX_OVER_PAR
  return par + 2 + strokesReceived(courseHandicap, strokeIndex)
}

/**
 * Total score for handicap purposes: every hole capped at net double bogey,
 * and any hole not played recorded as net par.
 */
export function adjustedGrossScore(
  scores: HoleScore[],
  holes: HoleInfo[],
  courseHandicap: number | null,
): number {
  const holesByNumber = new Map(holes.map((hole) => [hole.number, hole]))

  let total = 0
  for (const score of scores) {
    const hole = holesByNumber.get(score.number)
    if (!hole) continue

    if (score.strokes === null) {
      const received =
        courseHandicap === null ? 0 : strokesReceived(courseHandicap, hole.strokeIndex)
      total += hole.par + received
      continue
    }

    total += Math.min(score.strokes, maxHoleScore(hole.par, hole.strokeIndex, courseHandicap))
  }
  return total
}
