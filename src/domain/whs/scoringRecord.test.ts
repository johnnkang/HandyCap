import { describe, expect, test } from 'vitest'
import { buildScoringRecord } from './scoringRecord'
import { scoresOfBogey, scoresOfPar, testRound, testCourse, testHoles } from '@/test/fixtures'

describe('buildScoringRecord', () => {
  test('an empty record has no index', () => {
    const record = buildScoringRecord([])
    expect(record.index).toBeNull()
    expect(record.differentials).toEqual([])
  })

  test('two rounds are still not enough for an index', () => {
    const record = buildScoringRecord([
      testRound({ date: '2026-05-01', strokes: scoresOfBogey() }),
      testRound({ date: '2026-05-08', strokes: scoresOfBogey() }),
    ])
    expect(record.index).toBeNull()
    expect(record.differentials).toHaveLength(2)
  })

  test('three rounds of 90 on a neutral course give an index of 16.0', () => {
    // Each round: 90 gross, differential 90 - 72 = 18.0.
    // Three scores use the lowest one minus 2.0 -> 16.0.
    const record = buildScoringRecord([
      testRound({ date: '2026-05-01', strokes: scoresOfBogey() }),
      testRound({ date: '2026-05-08', strokes: scoresOfBogey() }),
      testRound({ date: '2026-05-15', strokes: scoresOfBogey() }),
    ])
    expect(record.differentials.map((d) => d.value)).toEqual([18.0, 18.0, 18.0])
    expect(record.index).toBe(16.0)
  })

  test('rounds are ordered chronologically regardless of input order', () => {
    const record = buildScoringRecord([
      testRound({ id: 'c', date: '2026-05-15', strokes: scoresOfBogey() }),
      testRound({ id: 'a', date: '2026-05-01', strokes: scoresOfBogey() }),
      testRound({ id: 'b', date: '2026-05-08', strokes: scoresOfBogey() }),
    ])
    expect(record.differentials.map((d) => d.roundId)).toEqual(['a', 'b', 'c'])
  })

  describe('net double bogey adjustment', () => {
    test("a first-time player's blow-up hole is capped at par plus five", () => {
      // No index yet, so hole 1 (par 4) caps at 9 instead of counting 12.
      const strokes = scoresOfBogey()
      strokes[0] = 12
      const record = buildScoringRecord([testRound({ date: '2026-05-01', strokes })])
      // 90 baseline, less the 5 that hole 1 contributed, plus the capped 9.
      expect(record.differentials[0]!.value).toBe(22.0)
    })

    test('an established player is capped at net double bogey', () => {
      const rounds = [
        testRound({ id: 'a', date: '2026-05-01', strokes: scoresOfBogey() }),
        testRound({ id: 'b', date: '2026-05-08', strokes: scoresOfBogey() }),
        testRound({ id: 'c', date: '2026-05-15', strokes: scoresOfBogey() }),
      ]
      // Index before the fourth round is 16.0, so course handicap 16 on this
      // tee: hole 1 has stroke index 1, so it caps at 4 + 2 + 1 = 7.
      const strokes = scoresOfBogey()
      strokes[0] = 12
      rounds.push(testRound({ id: 'd', date: '2026-05-22', strokes }))

      const record = buildScoringRecord(rounds)
      expect(record.differentials[3]!.value).toBe(20.0)
    })
  })

  describe('nine hole rounds', () => {
    test('a single nine is held pending and posts no differential', () => {
      const record = buildScoringRecord([
        testRound({ date: '2026-05-01', holeCount: 9, strokes: scoresOfBogey(9) }),
      ])
      expect(record.differentials).toHaveLength(0)
      expect(record.pendingNine?.differential).toBe(9.0)
    })

    test('two nines combine into one eighteen hole differential', () => {
      const record = buildScoringRecord([
        testRound({ id: 'n1', date: '2026-05-01', holeCount: 9, strokes: scoresOfBogey(9) }),
        testRound({ id: 'n2', date: '2026-05-08', holeCount: 9, strokes: scoresOfBogey(9) }),
      ])
      expect(record.differentials).toHaveLength(1)
      expect(record.differentials[0]!.value).toBe(18.0)
      expect(record.differentials[0]!.pairedWithRoundId).toBe('n1')
      expect(record.pendingNine).toBeNull()
    })
  })

  test('a quick total round posts a differential without hole detail', () => {
    const record = buildScoringRecord([
      testRound({ date: '2026-05-01', totalStrokes: 88 }),
    ])
    expect(record.differentials[0]!.value).toBe(16.0)
    expect(record.differentials[0]!.netDoubleBogeyApplied).toBe(false)
  })

  test('an exceptional score reduces the index immediately', () => {
    const rounds = ['2026-05-01', '2026-05-08', '2026-05-15', '2026-05-22', '2026-05-29'].map(
      (date) => testRound({ date, strokes: scoresOfBogey() }),
    )
    // Index is 18.0 after five rounds of 90.
    // A 75 posts a differential of 3.0 -- 15.0 better -- triggering a 2.0 reduction.
    const strokes = scoresOfPar()
    strokes[0] = strokes[0]! + 1
    strokes[1] = strokes[1]! + 1
    strokes[2] = strokes[2]! + 1
    rounds.push(testRound({ date: '2026-06-05', strokes }))

    const record = buildScoringRecord(rounds)
    expect(record.differentials[5]!.value).toBe(3.0)
    expect(record.differentials[5]!.exceptionalScoreReduction).toBe(-2.0)
    // Lowest two of six are 3.0 and 18.0 -> 10.5, minus 1.0 for a six-score
    // record -> 9.5, minus the 2.0 exceptional score reduction -> 7.5.
    expect(record.index).toBe(7.5)
  })

  test('a harder course produces a lower differential for the same score', () => {
    const hardCourse = testCourse({
      tee: { ...testCourse().tee, courseRating: 74.9, slope: 144 },
      holes: testHoles(18),
    })
    const record = buildScoringRecord([
      testRound({ date: '2026-05-01', strokes: scoresOfBogey(), course: hardCourse }),
    ])
    // (113 / 144) * (90 - 74.9) = 0.784722 * 15.1 = 11.849 -> 11.8
    expect(record.differentials[0]!.value).toBe(11.8)
  })

  test('tracks the index after every posted differential', () => {
    const record = buildScoringRecord([
      testRound({ date: '2026-05-01', strokes: scoresOfBogey() }),
      testRound({ date: '2026-05-08', strokes: scoresOfBogey() }),
      testRound({ date: '2026-05-15', strokes: scoresOfBogey() }),
    ])
    expect(record.indexHistory).toEqual([{ date: '2026-05-15', index: 16.0 }])
  })
})
