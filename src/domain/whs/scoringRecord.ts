import { adjustedGrossScore } from './netDoubleBogey'
import { scoreDifferential } from './differential'
import { courseHandicap } from './courseHandicap'
import { combineNines, deriveNineHoleRating } from './nineHole'
import { exceptionalScoreReduction } from './exceptionalScore'
import { lowHandicapIndex, type IndexHistoryEntry } from './lowHandicapIndex'
import {
  differentialsUsed,
  handicapIndex,
  SCORING_RECORD_SIZE,
  MIN_SCORES_FOR_INDEX,
} from './handicapIndex'
import { round1 } from './rounding'
import type { Round } from './types'

/** One 18-hole Score Differential in the scoring record, with its derivation. */
export interface PostedDifferential {
  /** The round that completed this differential. */
  roundId: string
  date: string
  /** The 18-hole Score Differential. */
  value: number
  grossScore: number
  adjustedGrossScore: number
  /** The Course Handicap used for the net double bogey cap, if any. */
  courseHandicapAtRound: number | null
  /** False for quick-total rounds, where there is no hole detail to cap. */
  netDoubleBogeyApplied: boolean
  /** 0, -1.0 or -2.0 (Rule 5.9). */
  exceptionalScoreReduction: number
  /** For a paired nine, the earlier nine it was combined with. */
  pairedWithRoundId: string | null
  holeCount: 9 | 18
}

export interface PendingNine {
  roundId: string
  date: string
  /** The 9-hole Score Differential, waiting for a second nine. */
  differential: number
}

export type CapStatus = 'none' | 'soft' | 'hard'

/** The parts of a posted differential the Rule 5.9 arithmetic needs. */
export type WindowEntry = Pick<PostedDifferential, 'value' | 'exceptionalScoreReduction'>

/**
 * Rule 5.9: the total reduction currently active across a window.
 *
 * Reductions live on the differentials that earned them, so they leave the
 * record on their own as those rounds age out.
 */
export function activeReduction(window: WindowEntry[]): number {
  return window.reduce((total, entry) => total + entry.exceptionalScoreReduction, 0)
}

/**
 * A window's differentials shifted by an active Rule 5.9 reduction.
 *
 * Reducing every value by the same amount moves the average by that amount,
 * which is exactly what the Rule intends.
 */
export function reducedValues(window: WindowEntry[], reduction: number): number[] {
  return window.map((entry) => round1(entry.value + reduction))
}

export interface ScoringRecord {
  /** The current Handicap Index, or null below three scores. */
  index: number | null
  lowHandicapIndex: number | null
  cap: CapStatus
  /** Every posted 18-hole differential, oldest first. */
  differentials: PostedDifferential[]
  /** The index after each round that changed it. */
  indexHistory: IndexHistoryEntry[]
  /** A nine waiting to be paired with another nine. */
  pendingNine: PendingNine | null
  /** Rounds whose differentials are among the lowest counted toward the index. */
  countingRoundIds: string[]
  /** How many more scores are needed before an index exists. */
  scoresNeeded: number
}

function grossScoreOf(round: Round): number {
  if (round.holeScores.length > 0) {
    return round.holeScores.reduce((total, hole) => total + (hole.strokes ?? 0), 0)
  }
  return round.totalStrokes ?? 0
}

/**
 * The differential a round produces on its own: an 18-hole differential for an
 * 18-hole round, a 9-hole differential for a nine.
 */
function differentialFor(round: Round, courseHandicapAtRound: number | null) {
  const { tee, holes } = round.course
  const isNine = round.holeCount === 9
  const courseRating = isNine ? deriveNineHoleRating(tee.courseRating) : tee.courseRating

  const hasHoleDetail = round.holeScores.length > 0
  const adjusted = hasHoleDetail
    ? adjustedGrossScore(round.holeScores, holes, courseHandicapAtRound)
    : (round.totalStrokes ?? 0)

  return {
    value: scoreDifferential({
      adjustedGrossScore: adjusted,
      courseRating,
      slope: tee.slope,
      pcc: round.pcc,
    }),
    adjusted,
    netDoubleBogeyApplied: hasHoleDetail,
  }
}

/**
 * Which differentials in the current window actually count toward the index:
 * the lowest N, where N comes from the Rule 5.2a table.
 */
function countingIdsOf(window: PostedDifferential[]): string[] {
  if (window.length < MIN_SCORES_FOR_INDEX) return []
  const { count } = differentialsUsed(window.length)
  return [...window]
    .sort((a, b) => a.value - b.value)
    .slice(0, count)
    .map((differential) => differential.roundId)
}

/**
 * Replay a player's whole scoring record to produce their current Handicap
 * Index and everything the app needs to explain it.
 *
 * The replay matters: the net double bogey cap on any round depends on the
 * Course Handicap the player held *when they played it*, so the record has to
 * be rebuilt forward in time rather than computed in one pass.
 */
export function buildScoringRecord(rounds: Round[]): ScoringRecord {
  const chronological = [...rounds].sort((a, b) => a.date.localeCompare(b.date))

  const differentials: PostedDifferential[] = []
  const indexHistory: IndexHistoryEntry[] = []
  let pendingNine: PendingNine | null = null
  let currentIndex: number | null = null
  let currentLow: number | null = null
  let cap: CapStatus = 'none'

  const recomputeIndex = (asOf: string) => {
    const window = differentials.slice(-SCORING_RECORD_SIZE)

    const values = reducedValues(window, activeReduction(window))

    // The Low Handicap Index, and therefore the caps, only exist once the
    // record is full (Rule 5.7).
    const established = differentials.length >= SCORING_RECORD_SIZE
    currentLow = established ? lowHandicapIndex(indexHistory, asOf) : null

    const uncapped = handicapIndex(values, null)
    const capped = handicapIndex(values, currentLow)

    if (uncapped === null || capped === null) {
      cap = 'none'
    } else if (capped === uncapped) {
      cap = 'none'
    } else {
      cap = currentLow !== null && capped >= currentLow + 5.0 ? 'hard' : 'soft'
    }

    currentIndex = capped
    if (currentIndex !== null) {
      indexHistory.push({ date: asOf, index: currentIndex })
    }
  }

  for (const round of chronological) {
    const { tee } = round.course
    const courseHandicapAtRound =
      currentIndex === null ? null : courseHandicap(currentIndex, tee)

    const { value, adjusted, netDoubleBogeyApplied } = differentialFor(
      round,
      courseHandicapAtRound,
    )

    let eighteenHoleValue: number
    let pairedWithRoundId: string | null = null

    if (round.holeCount === 9) {
      if (pendingNine === null) {
        pendingNine = { roundId: round.id, date: round.date, differential: value }
        continue
      }
      eighteenHoleValue = combineNines(pendingNine.differential, value)
      pairedWithRoundId = pendingNine.roundId
      pendingNine = null
    } else {
      eighteenHoleValue = value
    }

    differentials.push({
      roundId: round.id,
      date: round.date,
      value: eighteenHoleValue,
      grossScore: grossScoreOf(round),
      adjustedGrossScore: adjusted,
      courseHandicapAtRound,
      netDoubleBogeyApplied,
      exceptionalScoreReduction: exceptionalScoreReduction(eighteenHoleValue, currentIndex),
      pairedWithRoundId,
      holeCount: round.holeCount,
    })

    recomputeIndex(round.date)
  }

  return {
    index: currentIndex,
    lowHandicapIndex: currentLow,
    cap,
    differentials,
    indexHistory,
    pendingNine,
    countingRoundIds: countingIdsOf(differentials.slice(-SCORING_RECORD_SIZE)),
    scoresNeeded: Math.max(0, MIN_SCORES_FOR_INDEX - differentials.length),
  }
}
