import { toTenths } from './rounding'

/** A round this far below the index reduces it by 1.0. */
const SINGLE_REDUCTION_THRESHOLD = 7.0

/** A round this far below the index reduces it by 2.0. */
const DOUBLE_REDUCTION_THRESHOLD = 10.0

/**
 * Exceptional Score Reduction (Rule 5.9).
 *
 * A round far better than your index is evidence the index is stale, so the
 * Rules reduce it immediately rather than waiting for the 8-of-20 average to
 * catch up.
 *
 * @param differential The Score Differential just posted.
 * @param indexAtRound The Handicap Index in force when the round was played.
 * @returns 0, -1.0 or -2.0.
 */
export function exceptionalScoreReduction(
  differential: number,
  indexAtRound: number | null,
): number {
  if (indexAtRound === null) return 0

  // Compare in whole tenths: a differential exactly 9.9 below the index must
  // not tip over the 10.0 threshold through binary floating point error.
  const strokesBetter = toTenths(indexAtRound) - toTenths(differential)

  if (strokesBetter >= toTenths(DOUBLE_REDUCTION_THRESHOLD)) return -2.0
  if (strokesBetter >= toTenths(SINGLE_REDUCTION_THRESHOLD)) return -1.0
  return 0
}
