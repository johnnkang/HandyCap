import { round1 } from './rounding'

/** The neutral slope rating: the standard course a differential is expressed against. */
export const NEUTRAL_SLOPE = 113

export interface DifferentialInput {
  adjustedGrossScore: number
  courseRating: number
  slope: number
  /**
   * Playing Conditions Calculation. Always 0 in HandyCap — see `Round.pcc`.
   */
  pcc?: number
}

/**
 * Score Differential (Rule 5.1a):
 *
 *     (113 / Slope) x (Adjusted Gross Score - Course Rating - PCC)
 *
 * This is the round's difficulty-adjusted result: what you shot, expressed on
 * a standard course, so that a 78 at Bethpage Black and a 78 at a muni become
 * directly comparable.
 */
export function scoreDifferential({
  adjustedGrossScore,
  courseRating,
  slope,
  pcc = 0,
}: DifferentialInput): number {
  return round1((NEUTRAL_SLOPE / slope) * (adjustedGrossScore - courseRating - pcc))
}
