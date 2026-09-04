import { roundHalfAwayFromZero } from './rounding'
import { NEUTRAL_SLOPE } from './differential'

export interface RatedTee {
  slope: number
  courseRating: number
  par: number
}

/**
 * Course Handicap (Rule 6.1): the strokes you actually play off at a given
 * course and tee.
 *
 *     Handicap Index x (Slope / 113) + (Course Rating - Par)
 *
 * The slope term scales your index to how much harder this course plays for a
 * bogey golfer; the rating term accounts for a course whose par understates or
 * overstates its difficulty.
 */
export function courseHandicap(index: number, tee: RatedTee): number {
  const raw = index * (tee.slope / NEUTRAL_SLOPE) + (tee.courseRating - tee.par)
  return roundHalfAwayFromZero(raw)
}

/**
 * Playing Handicap: the Course Handicap after a format's handicap allowance.
 * Stroke play off the full handicap is the default.
 */
export function playingHandicap(courseHandicapValue: number, allowance = 1): number {
  return roundHalfAwayFromZero(courseHandicapValue * allowance)
}
