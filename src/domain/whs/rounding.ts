/**
 * Rounding helpers.
 *
 * The WHS rounds to the nearest tenth. JavaScript's `Math.round` breaks ties
 * toward positive infinity, which is wrong for plus handicaps, and binary
 * floating point puts values like 10.05 just *below* the tie. Both are handled
 * here so no caller has to think about it.
 */

/** Round half away from zero, to one decimal place. */
export function round1(value: number): number {
  const scaled = value * 10
  const epsilon = 1e-9
  const rounded =
    scaled >= 0 ? Math.floor(scaled + 0.5 + epsilon) : Math.ceil(scaled - 0.5 - epsilon)
  return rounded / 10
}

/**
 * A value already known to carry one decimal place, as an exact integer number
 * of tenths. Lets us average differentials without accumulating binary error.
 */
export function toTenths(value: number): number {
  return Math.round(value * 10)
}

/** Round half away from zero, to a whole number. */
export function roundHalfAwayFromZero(value: number): number {
  const epsilon = 1e-9
  return value >= 0 ? Math.floor(value + 0.5 + epsilon) : Math.ceil(value - 0.5 - epsilon)
}
