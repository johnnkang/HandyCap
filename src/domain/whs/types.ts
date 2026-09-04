/**
 * Core domain types for the World Handicap System engine.
 *
 * Everything in `domain/` is pure: no React, no network, no ambient clock.
 * Anything time-dependent takes an explicit `asOf` date.
 */

/** Which nine a 9-hole round was played on. */
export type Nine = 'front' | 'back'

/** A single hole's static information, as printed on the scorecard. */
export interface HoleInfo {
  /** 1-based hole number. */
  number: number
  par: number
  /** Stroke index / handicap ranking, 1 = hardest. */
  strokeIndex: number
}

/** A rated set of tees. Ratings are always the 18-hole values. */
export interface TeeSet {
  /** Stable key, e.g. "blue-male". */
  key: string
  name: string
  color: string | null
  gender: 'male' | 'female' | 'unspecified'
  courseRating: number
  slope: number
  par: number
  yardage: number | null
}

/**
 * A course as it was on the day a round was played.
 *
 * Rounds store their own copy of this (see `Round.course`) so a saved
 * differential can never change because the upstream database was edited.
 */
export interface CourseSnapshot {
  /** OpenGolfAPI id, or a locally-generated id for manually entered courses. */
  id: string
  name: string
  city: string | null
  state: string | null
  tee: TeeSet
  /** 18 entries for an 18-hole course, 9 for a 9-hole course. */
  holes: HoleInfo[]
  /** True when the player typed the ratings in by hand. */
  manualEntry: boolean
}

/** What the player recorded on one hole. */
export interface HoleScore {
  number: number
  /** Strokes taken. `null` means the hole was not played / not recorded. */
  strokes: number | null
  putts: number | null
  /** Not applicable on par 3s. */
  fairwayHit: boolean | null
  /** Green in regulation. */
  greenInRegulation: boolean | null
}

/**
 * A posted round.
 *
 * `holeScores` is empty for a quick-total round, in which case `totalStrokes`
 * carries the score and per-hole analysis is unavailable.
 */
export interface Round {
  id: string
  /** ISO date, YYYY-MM-DD, of the day played. */
  date: string
  course: CourseSnapshot
  holeCount: 9 | 18
  /** Which nine, for 9-hole rounds. */
  nine: Nine | null
  holeScores: HoleScore[]
  /** Set only for quick-total rounds; otherwise derived from `holeScores`. */
  totalStrokes: number | null
  /**
   * Playing Conditions Calculation. Always 0 in HandyCap — computing it needs
   * every score posted at that course that day. Kept in the model so a future
   * data source can supply it without a migration.
   */
  pcc: number
}
