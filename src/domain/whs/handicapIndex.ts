import { round1, toTenths, roundHalfAwayFromZero } from './rounding'

/** The highest Handicap Index the Rules allow (Rule 5.3). */
export const MAX_HANDICAP_INDEX = 54.0

/** The fewest scores that can produce a Handicap Index. */
export const MIN_SCORES_FOR_INDEX = 3

/** The size of the scoring record the index is drawn from. */
export const SCORING_RECORD_SIZE = 20

/** Increases beyond this many strokes above the Low Handicap Index are halved. */
const SOFT_CAP_THRESHOLD = 3.0

/** The index may never sit more than this many strokes above the Low Handicap Index. */
const HARD_CAP_THRESHOLD = 5.0

export interface DifferentialSelection {
  /** How many of the lowest Score Differentials are averaged. */
  count: number
  /** Strokes added to that average, always zero or negative. */
  adjustment: number
}

/**
 * Rule 5.2a: how many Score Differentials to use, and what adjustment applies,
 * for a scoring record holding fewer than 20 scores.
 *
 * The negative adjustments on very small records exist because a handful of
 * rounds over-represents a player's best golf.
 */
export function differentialsUsed(scoreCount: number): DifferentialSelection {
  if (scoreCount < MIN_SCORES_FOR_INDEX) return { count: 0, adjustment: 0 }
  if (scoreCount === 3) return { count: 1, adjustment: -2.0 }
  if (scoreCount === 4) return { count: 1, adjustment: -1.0 }
  if (scoreCount === 5) return { count: 1, adjustment: 0 }
  if (scoreCount === 6) return { count: 2, adjustment: -1.0 }
  if (scoreCount <= 8) return { count: 2, adjustment: 0 }
  if (scoreCount <= 11) return { count: 3, adjustment: 0 }
  if (scoreCount <= 14) return { count: 4, adjustment: 0 }
  if (scoreCount <= 16) return { count: 5, adjustment: 0 }
  if (scoreCount <= 18) return { count: 6, adjustment: 0 }
  if (scoreCount === 19) return { count: 7, adjustment: 0 }
  return { count: 8, adjustment: 0 }
}

/**
 * Rule 5.6: hold back a rising index so one bad stretch cannot undo a season.
 *
 * Increases of more than 3.0 strokes above the Low Handicap Index are halved
 * beyond that point (the soft cap), and the result can never sit more than 5.0
 * strokes above it (the hard cap). Neither ever restricts a downward move.
 */
export function applyCaps(index: number, lowHandicapIndex: number): number {
  const increase = index - lowHandicapIndex
  if (increase <= SOFT_CAP_THRESHOLD) return index

  const softCapped =
    lowHandicapIndex + SOFT_CAP_THRESHOLD + (increase - SOFT_CAP_THRESHOLD) / 2
  return Math.min(softCapped, lowHandicapIndex + HARD_CAP_THRESHOLD)
}

/**
 * A player's Handicap Index (Rule 5.2).
 *
 * Averages the lowest N of the most recent 20 Score Differentials, where N and
 * any adjustment come from `differentialsUsed`.
 *
 * @param differentials Score Differentials in chronological order, oldest first.
 * @param lowHandicapIndex The player's Low Handicap Index, when established.
 *   Pass `null` or omit to skip the caps, which is correct before 20 scores.
 * @returns The index, or `null` when there are fewer than three scores.
 */
export function handicapIndex(
  differentials: number[],
  lowHandicapIndex?: number | null,
): number | null {
  const recent = differentials.slice(-SCORING_RECORD_SIZE)
  if (recent.length < MIN_SCORES_FOR_INDEX) return null

  const { count, adjustment } = differentialsUsed(recent.length)

  // Average in whole tenths so a value like 10.05 lands on the right side of
  // the tie instead of drifting below it in binary floating point.
  const lowestTenths = recent
    .map(toTenths)
    .sort((a, b) => a - b)
    .slice(0, count)
  const averageTenths = roundHalfAwayFromZero(
    lowestTenths.reduce((total, tenths) => total + tenths, 0) / count,
  )

  let index = Math.min(averageTenths / 10 + adjustment, MAX_HANDICAP_INDEX)
  if (lowHandicapIndex !== null && lowHandicapIndex !== undefined) {
    index = applyCaps(index, lowHandicapIndex)
  }
  return round1(index)
}
