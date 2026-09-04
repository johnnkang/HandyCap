import { handicapIndex, SCORING_RECORD_SIZE } from './handicapIndex'
import { round1, roundHalfAwayFromZero } from './rounding'
import { NEUTRAL_SLOPE } from './differential'
import { exceptionalScoreReduction } from './exceptionalScore'
import type { RatedTee } from './courseHandicap'
import type { PostedDifferential, ScoringRecord } from './scoringRecord'

/** How many future rounds `roundsToReachTarget` will look ahead before giving up. */
const PROJECTION_HORIZON = 40

/** The best and worst differentials worth searching when solving for a score. */
const SEARCH_FLOOR = -20
const SEARCH_CEILING = 60

/** The Score Differential a gross score would produce at a given tee. */
export function differentialForScore(score: number, tee: RatedTee): number {
  return round1((NEUTRAL_SLOPE / tee.slope) * (score - tee.courseRating))
}

/** The gross score that would produce a given Score Differential at a tee. */
export function scoreForDifferential(differential: number, tee: RatedTee): number {
  return roundHalfAwayFromZero(differential * (tee.slope / NEUTRAL_SLOPE) + tee.courseRating)
}

/**
 * Reduce a window of differentials to an index, applying any Rule 5.9
 * reductions still active within it. Mirrors what `buildScoringRecord` does, so
 * a projection and a real post agree.
 */
function indexFromWindow(
  window: Pick<PostedDifferential, 'value' | 'exceptionalScoreReduction'>[],
  low: number | null,
): number | null {
  const activeReduction = window.reduce(
    (total, differential) => total + differential.exceptionalScoreReduction,
    0,
  )
  const values = window.map((differential) => round1(differential.value + activeReduction))
  return handicapIndex(values, low)
}

/** The 20-score window after one more round at `differential`. */
function appendCandidate(
  existing: Pick<PostedDifferential, 'value' | 'exceptionalScoreReduction'>[],
  differential: number,
  currentIndex: number | null,
) {
  return [
    ...existing,
    {
      value: differential,
      exceptionalScoreReduction: exceptionalScoreReduction(differential, currentIndex),
    },
  ].slice(-SCORING_RECORD_SIZE)
}

/**
 * What the Handicap Index becomes if the player posts one more round with the
 * given Score Differential.
 */
export function projectIndex(record: ScoringRecord, differential: number): number | null {
  const window = appendCandidate(record.differentials, differential, record.index)
  return indexFromWindow(window, record.lowHandicapIndex)
}

/**
 * The differential that will leave the 20-score window when the next round is
 * posted. Null until the record is full, since nothing rolls off before then.
 *
 * This is the most under-appreciated fact about a handicap: an index can drift
 * upward purely because a good round aged out, with nothing else changing.
 */
export function nextRollOff(record: ScoringRecord): PostedDifferential | null {
  if (record.differentials.length < SCORING_RECORD_SIZE) return null
  return record.differentials[record.differentials.length - SCORING_RECORD_SIZE] ?? null
}

/** The player's average differential over their most recent rounds. */
export function recentForm(record: ScoringRecord, rounds = 5): number | null {
  const recent = record.differentials.slice(-rounds)
  if (recent.length === 0) return null
  const total = recent.reduce((sum, differential) => sum + differential.value, 0)
  return round1(total / recent.length)
}

export interface TrajectoryPoint {
  roundsAhead: number
  index: number | null
}

/**
 * Where the index heads if every future round produces `assumedDifferential`.
 *
 * The Low Handicap Index is held fixed at its current value: a falling index
 * would pull it down in reality, which makes this projection conservative
 * rather than optimistic.
 */
export function trajectory(
  record: ScoringRecord,
  assumedDifferential: number,
  roundsAhead: number,
): TrajectoryPoint[] {
  let window: Pick<PostedDifferential, 'value' | 'exceptionalScoreReduction'>[] =
    record.differentials
  let index = record.index
  const path: TrajectoryPoint[] = []

  for (let round = 1; round <= roundsAhead; round++) {
    window = appendCandidate(window, assumedDifferential, index)
    index = indexFromWindow(window, record.lowHandicapIndex)
    path.push({ roundsAhead: round, index })
  }
  return path
}

/**
 * The highest (easiest) Score Differential that would bring the index to
 * `target` in a single round, or null when one round cannot get there.
 */
export function differentialNeededNextRound(
  record: ScoringRecord,
  target: number,
): number | null {
  const bestPossible = projectIndex(record, SEARCH_FLOOR)
  if (bestPossible === null || bestPossible > target) return null

  // Walk down in tenths from the easiest differential that could plausibly
  // work. The search space is small enough that this stays exact.
  for (let tenths = SEARCH_CEILING * 10; tenths >= SEARCH_FLOOR * 10; tenths--) {
    const candidate = tenths / 10
    const projected = projectIndex(record, candidate)
    if (projected !== null && projected <= target) return round1(candidate)
  }
  return null
}

/**
 * How many rounds of `assumedDifferential` form it takes to reach `target`.
 * Returns 0 if the target is already met, or null if that form never gets there.
 */
export function roundsToReachTarget(
  record: ScoringRecord,
  target: number,
  assumedDifferential: number,
): number | null {
  if (record.index !== null && record.index <= target) return 0

  const path = trajectory(record, assumedDifferential, PROJECTION_HORIZON)
  const reached = path.find((point) => point.index !== null && point.index <= target)
  return reached ? reached.roundsAhead : null
}
