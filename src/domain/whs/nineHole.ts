import { round1 } from './rounding'
import { scoreDifferential, type DifferentialInput } from './differential'

/**
 * A 9-hole Course Rating derived from the 18-hole one.
 *
 * OpenGolfAPI publishes 18-hole ratings only. Halving is the standard
 * approximation when a separate 9-hole rating is unavailable; the slope is
 * unchanged, since slope already expresses relative difficulty.
 */
export function deriveNineHoleRating(eighteenHoleRating: number): number {
  return eighteenHoleRating / 2
}

/**
 * A 9-hole Score Differential. Same formula as the 18-hole one, against the
 * 9-hole rating.
 */
export function nineHoleDifferential(input: DifferentialInput): number {
  return scoreDifferential(input)
}

/**
 * Combine two 9-hole Score Differentials into one 18-hole Score Differential.
 *
 * The 2024 Rules convert a single nine using an "expected Score Differential"
 * table that the USGA has not published, so HandyCap uses the previous official
 * method of pairing two nines. A single unpaired nine stays pending.
 */
export function combineNines(first: number, second: number): number {
  return round1(first + second)
}
