import { describe, expect, test } from 'vitest'
import { buildScoringRecord } from './scoringRecord'
import {
  explainIndexChange,
  explainRoundPosted,
  indexTimeline,
  type IndexChangeCause,
  type IndexRetrospective,
} from './retrospective'
import { toTenths } from './rounding'
import { scoresOfBogey, testRound } from '@/test/fixtures'
import type { Round } from './types'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const day = (offset: number) =>
  new Date(Date.parse('2026-01-05T00:00:00Z') + offset * MS_PER_DAY).toISOString().slice(0, 10)

/**
 * Rounds entered as totals on the neutral tee, where the Score Differential is
 * exactly `total - 72`. No hole detail means no net double bogey adjustment, so
 * the arithmetic under test is not entangled with the cap.
 */
const roundsOf = (totals: number[]): Round[] =>
  totals.map((totalStrokes, i) => testRound({ id: `r${i}`, date: day(i * 7), totalStrokes }))

const recordOf = (totals: number[]) => buildScoringRecord(roundsOf(totals))

const causeOf = <K extends IndexChangeCause['kind']>(
  causes: IndexChangeCause[],
  kind: K,
): Extract<IndexChangeCause, { kind: K }> | undefined =>
  causes.find((cause): cause is Extract<IndexChangeCause, { kind: K }> => cause.kind === kind)

/** The load-bearing property: an explanation that does not add up is a story. */
const expectCausesToSumToMovement = (retro: IndexRetrospective) => {
  if (retro.movement.strokes === null) {
    expect(retro.causes).toEqual([])
    return
  }
  const summed = retro.causes.reduce((total, cause) => total + toTenths(cause.strokes), 0)
  expect(summed).toBe(toTenths(retro.movement.strokes))
}

describe('explainIndexChange', () => {
  test('reports that there is still no index below three scores', () => {
    const retro = explainIndexChange(recordOf([90]), recordOf([90, 88]))

    expect(retro.movement.kind).toBe('notYet')
    expect(retro.movement.strokes).toBeNull()
    expect(retro.causes).toEqual([])
  })

  test('reports the arrival of a first index rather than a change', () => {
    const retro = explainIndexChange(recordOf([90, 88]), recordOf([90, 88, 86]))

    expect(retro.movement.kind).toBe('first')
    expect(retro.movement.before).toBeNull()
    expect(retro.movement.after).not.toBeNull()
    expect(retro.causes).toEqual([])
  })

  test('reports an index lost when a delete drops below three scores', () => {
    const retro = explainIndexChange(recordOf([90, 88, 86]), recordOf([90, 88]))

    expect(retro.movement.kind).toBe('lost')
    expect(retro.movement.after).toBeNull()
  })

  test('a better round lowers the index and is credited for it', () => {
    const before = recordOf([90, 90, 90])
    const after = recordOf([90, 90, 90, 80])
    const retro = explainIndexChange(before, after)

    expect(retro.movement.kind).toBe('down')
    const entered = causeOf(retro.causes, 'entered')
    expect(entered).toBeDefined()
    expect(entered!.strokes).toBeLessThan(0)
    expectCausesToSumToMovement(retro)
  })

  test('a round too poor to count is reported as costing nothing', () => {
    // "It joined your record and changed nothing" is a real answer, and the
    // one players most often mistake for the app being broken.
    const before = recordOf([80, 80, 80, 80])
    const after = recordOf([80, 80, 80, 80, 110])
    const retro = explainIndexChange(before, after)

    const entered = causeOf(retro.causes, 'entered')
    expect(entered!.strokes).toBe(0)
    expectCausesToSumToMovement(retro)
  })

  test('a good round ageing out raises the index with nothing played badly', () => {
    // Twenty scores where the oldest is the only good one, then one more round
    // pushes it out of the window.
    const totals = [77, ...Array.from({ length: 19 }, () => 90)]
    const before = recordOf(totals)
    const after = recordOf([...totals, 90])
    const retro = explainIndexChange(before, after)

    const agedOut = causeOf(retro.causes, 'agedOut')
    expect(agedOut).toBeDefined()
    expect(agedOut!.strokes).toBeGreaterThan(0)
    expect(causeOf(retro.causes, 'entered')!.strokes).toBe(0)
    expectCausesToSumToMovement(retro)
  })

  test('a deleted round is not described as having aged out', () => {
    const before = recordOf([90, 88, 86, 84])
    const rounds = roundsOf([90, 88, 86, 84]).filter((round) => round.id !== 'r1')
    const retro = explainIndexChange(before, buildScoringRecord(rounds))

    expect(causeOf(retro.causes, 'deleted')).toBeDefined()
    expect(causeOf(retro.causes, 'agedOut')).toBeUndefined()
    expectCausesToSumToMovement(retro)
  })

  test('the sixth score is credited to the rule change, not blamed on the round', () => {
    // Rule 5.2a's six-score row averages the lowest two and subtracts 1.0. The
    // index falls even though the new round is the worst on record.
    const before = recordOf([82, 82, 82, 82, 82])
    const after = recordOf([82, 82, 82, 82, 82, 122])
    const retro = explainIndexChange(before, after)

    expect(retro.movement.strokes).toBe(-1.0)
    expect(causeOf(retro.causes, 'entered')!.strokes).toBe(0)
    const selection = causeOf(retro.causes, 'selection')
    expect(selection!.strokes).toBe(-1.0)
    expectCausesToSumToMovement(retro)
  })

  test('the seventh score gives that stroke back', () => {
    const before = recordOf([82, 82, 82, 82, 82, 122])
    const after = recordOf([82, 82, 82, 82, 82, 122, 122])
    const retro = explainIndexChange(before, after)

    expect(causeOf(retro.causes, 'selection')!.strokes).toBe(1.0)
    expectCausesToSumToMovement(retro)
  })

  test('says nothing about the selection row once the record is full', () => {
    const totals = Array.from({ length: 20 }, () => 90)
    const retro = explainIndexChange(recordOf(totals), recordOf([...totals, 88]))

    expect(causeOf(retro.causes, 'selection')).toBeUndefined()
  })

  test('reports a backdated round re-deriving a round already posted', () => {
    // The subtlety that rules out watching a record being built: a round's
    // blow-up hole caps at par + 5 with no index, but at net double bogey once
    // one exists. Inserting earlier rounds therefore silently rewrites a
    // differential the player posted long ago.
    const blowUp = scoresOfBogey()
    blowUp[0] = 12
    const later = testRound({ id: 'later', date: day(40), strokes: blowUp })
    const followers = [
      testRound({ id: 'f1', date: day(47), totalStrokes: 90 }),
      testRound({ id: 'f2', date: day(54), totalStrokes: 90 }),
    ]
    // 'later' is first here, so it was played with no index: 12 caps at 9.
    const before = buildScoringRecord([later, ...followers])
    // Now three rounds precede it, so it was played off a Course Handicap of
    // 16 and that 12 caps at 7 instead.
    const after = buildScoringRecord([...roundsOf([90, 90, 90]), later, ...followers])

    const retro = explainIndexChange(before, after)
    expect(causeOf(retro.causes, 'revised')).toMatchObject({
      roundId: 'later',
      from: 22.0,
      to: 20.0,
    })
    expectCausesToSumToMovement(retro)
  })

  test('names which rounds started and stopped counting', () => {
    const before = recordOf([90, 90, 90, 90, 90, 90, 90, 90, 90])
    const after = recordOf([90, 90, 90, 90, 90, 90, 90, 90, 90, 70])
    const retro = explainIndexChange(before, after)

    expect(retro.countingSet.startedCounting).toContain('r9')
  })

  test('flags a tie at the counting boundary rather than inventing a swap', () => {
    // Every round scored the same, so which ones "count" is arbitrary and the
    // index did not move. Claiming a swap here would be noise.
    const totals = Array.from({ length: 10 }, () => 90)
    const retro = explainIndexChange(recordOf(totals), recordOf([...totals, 90]))

    expect(retro.countingSet.tiedAtBoundary).toBe(true)
    expect(retro.movement.strokes).toBe(0)
  })

  test('picks the largest cause as the principal one', () => {
    const totals = [77, ...Array.from({ length: 19 }, () => 90)]
    const retro = explainIndexChange(recordOf(totals), recordOf([...totals, 90]))

    expect(retro.principalCause!.kind).toBe('agedOut')
  })
})

describe('explainRoundPosted', () => {
  test('explains what the most recent round did', () => {
    const rounds = roundsOf([90, 90, 90, 80])
    const retro = explainRoundPosted(rounds, 'r3')

    expect(retro.movement.kind).toBe('down')
    expect(causeOf(retro.causes, 'entered')).toBeDefined()
    expectCausesToSumToMovement(retro)
  })

  test('explains what an older round is still worth today', () => {
    const rounds = roundsOf([90, 90, 90, 80, 88])
    const retro = explainRoundPosted(rounds, 'r3')

    expect(retro.movement.before).not.toBeNull()
    expectCausesToSumToMovement(retro)
  })

  test('a lone nine reports nothing changed and why', () => {
    const nine = testRound({
      id: 'nine',
      date: day(40),
      holeCount: 9,
      nine: 'front',
      totalStrokes: 45,
    })
    const retro = explainRoundPosted([...roundsOf([90, 90, 90]), nine], 'nine')

    expect(retro.causes).toEqual([])
    expect(retro.pendingNine).not.toBeNull()
  })
})

/** A tiny deterministic generator, so a failure is always reproducible. */
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

describe('the attribution adds up', () => {
  // The load-bearing property of the whole feature. An explanation whose parts
  // do not sum to the whole is a plausible story, not an account — and this app
  // exists precisely because the plausible-but-wrong version already exists.
  test('causes sum exactly to the movement, across 300 random records', () => {
    const random = seeded(20260907)
    let checked = 0

    for (let trial = 0; trial < 300; trial++) {
      const size = 2 + Math.floor(random() * 28)
      const totals = Array.from({ length: size }, () => 68 + Math.floor(random() * 45))
      const before = recordOf(totals)
      const after = recordOf([...totals, 68 + Math.floor(random() * 45)])
      const retro = explainIndexChange(before, after)

      if (retro.movement.strokes === null) continue
      const summed = retro.causes.reduce((total, cause) => total + toTenths(cause.strokes), 0)
      expect(summed).toBe(toTenths(retro.movement.strokes))
      checked++
    }

    // Guard against the assertion never running because everything was skipped.
    expect(checked).toBeGreaterThan(250)
  })

  test('causes sum exactly when a round is deleted from the middle', () => {
    const random = seeded(77)
    for (let trial = 0; trial < 100; trial++) {
      const size = 4 + Math.floor(random() * 25)
      const totals = Array.from({ length: size }, () => 68 + Math.floor(random() * 45))
      const rounds = roundsOf(totals)
      const dropped = Math.floor(random() * rounds.length)
      const after = buildScoringRecord(rounds.filter((_, i) => i !== dropped))
      const retro = explainIndexChange(buildScoringRecord(rounds), after)

      if (retro.movement.strokes === null) continue
      const summed = retro.causes.reduce((total, cause) => total + toTenths(cause.strokes), 0)
      expect(summed).toBe(toTenths(retro.movement.strokes))
    }
  })

  test('every cause carries a real number of strokes', () => {
    const random = seeded(4242)
    for (let trial = 0; trial < 100; trial++) {
      const size = 2 + Math.floor(random() * 28)
      const totals = Array.from({ length: size }, () => 68 + Math.floor(random() * 45))
      const retro = explainIndexChange(
        recordOf(totals),
        recordOf([...totals, 68 + Math.floor(random() * 45)]),
      )
      for (const cause of retro.causes) {
        expect(Number.isFinite(cause.strokes)).toBe(true)
      }
    }
  })
})

describe('indexTimeline', () => {
  test('walks the record forward, one entry per round that moved the index', () => {
    const timeline = indexTimeline(roundsOf([90, 90, 90, 80, 88]))

    // The first two rounds produced no index at all, so there is nothing to
    // show for them; the third is the arrival, and two movements follow.
    expect(timeline.map((entry) => entry.roundId)).toEqual(['r2', 'r3', 'r4'])
    expect(timeline[0]!.retrospective.movement.kind).toBe('first')
    expect(timeline[1]!.retrospective.movement.kind).toBe('down')
  })

  test('reports the history as it was lived, not as it looks in hindsight', () => {
    // Each entry compares the record as it stood before that round with the
    // record immediately after, so a later round cannot rewrite an earlier
    // entry's story.
    const timeline = indexTimeline(roundsOf([90, 90, 90, 80]))

    expect(timeline[1]!.retrospective.movement.before).toBe(16.0)
    expect(timeline[1]!.retrospective.movement.after).toBe(6.0)
  })

  test('orders by date even when rounds arrive out of order', () => {
    const rounds = roundsOf([90, 90, 90, 88])
    const shuffled = [rounds[3]!, rounds[0]!, rounds[2]!, rounds[1]!]

    expect(indexTimeline(shuffled).map((entry) => entry.date)).toEqual(
      indexTimeline(rounds).map((entry) => entry.date),
    )
  })

  test('is empty for a record with no index', () => {
    expect(indexTimeline(roundsOf([90, 90]))).toEqual([])
  })
})
