import type { ScoringRecord } from '@/domain/whs/scoringRecord'
import type { Round } from '@/domain/whs/types'

export interface RoundView {
  round: Round
  grossScore: number | null
  /** The 18-hole Score Differential this round completed, if it completed one. */
  differential: number | null
  /** Whether that differential is among the lowest currently counting. */
  counting: boolean
  /** For a nine that completed a pair, the earlier nine it was combined with. */
  pairedWith: string | null
  /** A nine still waiting for a partner, so not yet affecting the index. */
  pending: boolean
  /** A nine that was absorbed into a later round's paired differential. */
  contributedToPair: boolean
}

function grossScoreOf(round: Round): number | null {
  if (round.holeScores.length > 0) {
    const played = round.holeScores.filter((hole) => hole.strokes !== null)
    if (played.length === 0) return null
    return played.reduce((total, hole) => total + (hole.strokes ?? 0), 0)
  }
  return round.totalStrokes
}

/**
 * Join rounds to what the engine did with them, newest first.
 *
 * A round and a Score Differential are not one-to-one: two nines produce a
 * single differential, and a lone nine produces none at all until it is paired.
 * The history screen has to show all three states honestly, so it reads from
 * this rather than from either list on its own.
 */
export function roundViews(rounds: Round[], record: ScoringRecord): RoundView[] {
  const differentialByRound = new Map(
    record.differentials.map((differential) => [differential.roundId, differential]),
  )
  const counting = new Set(record.countingRoundIds)
  const absorbed = new Set(
    record.differentials
      .map((differential) => differential.pairedWithRoundId)
      .filter((id): id is string => id !== null),
  )

  return [...rounds]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .map((round) => {
      const differential = differentialByRound.get(round.id) ?? null
      return {
        round,
        grossScore: grossScoreOf(round),
        differential: differential?.value ?? null,
        counting: counting.has(round.id),
        pairedWith: differential?.pairedWithRoundId ?? null,
        pending: record.pendingNine?.roundId === round.id,
        contributedToPair: absorbed.has(round.id),
      }
    })
}
