import type { Round } from '@/domain/whs/types'

export interface DuplicatePair {
  kept: Round
  other: Round
}

/** Gross strokes, however the round recorded them. */
const strokesOf = (round: Round): number | null =>
  round.totalStrokes ??
  (round.holeScores.length > 0
    ? round.holeScores.reduce((total, hole) => total + (hole.strokes ?? 0), 0)
    : null)

/**
 * Rounds that look like the same round entered twice.
 *
 * Same course, same tee, same date, same gross score, different ids. The tee is
 * part of the key so a genuine 36-hole day from different tees is not flagged.
 *
 * Detection only. Deleting a round is always the golfer's decision — a wrong
 * guess here would silently change someone's Handicap Index.
 */
export function findProbableDuplicates(rounds: Round[]): DuplicatePair[] {
  const seen = new Map<string, Round>()
  const pairs: DuplicatePair[] = []

  for (const round of rounds) {
    const strokes = strokesOf(round)
    if (strokes === null) continue

    const key = [round.date, round.course.id, round.course.tee.key, round.holeCount, strokes].join('|')
    const held = seen.get(key)
    if (held) pairs.push({ kept: held, other: round })
    else seen.set(key, round)
  }

  return pairs
}
