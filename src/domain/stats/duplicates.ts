import type { Round } from '@/domain/whs/types'

export interface DuplicatePair {
  kept: Round
  other: Round
}

/** Gross strokes, however the round recorded them, or null if unknowable. */
const strokesOf = (round: Round): number | null => {
  if (round.totalStrokes !== null) return round.totalStrokes
  if (round.holeScores.length === 0) return null
  // A part-recorded card has no meaningful gross total. Summing it with the
  // gaps counted as zero would undercount, and an undercount can collide with
  // an unrelated round — which would accuse a golfer of double posting. Say
  // nothing instead.
  if (round.holeScores.some((hole) => hole.strokes === null)) return null
  return round.holeScores.reduce((total, hole) => total + (hole.strokes ?? 0), 0)
}

/**
 * Rounds that look like the same round entered twice.
 *
 * Same course, same tee, same nine, same date, same gross score, different ids.
 * The tee and the nine are both part of the key because both distinguish
 * ordinary golf from a double post: 36 holes from different tees is a real
 * day's play, and so is a front nine and a back nine on the same afternoon.
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

    const key = [
      round.date,
      round.course.id,
      round.course.tee.key,
      round.holeCount,
      round.nine ?? '',
      strokes,
    ].join('|')
    const held = seen.get(key)
    if (held) pairs.push({ kept: held, other: round })
    else seen.set(key, round)
  }

  return pairs
}
