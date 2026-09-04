import { describe, expect, test } from 'vitest'
import { scoreSummary, differentialSummary, coursePerformance, shotStats } from './roundStats'
import { buildScoringRecord } from '@/domain/whs/scoringRecord'
import { scoresOfBogey, scoresOfPar, testCourse, testHoles, testRound } from '@/test/fixtures'

describe('scoreSummary', () => {
  test('reports nothing for an empty record', () => {
    const summary = scoreSummary([], 18)
    expect(summary).toEqual({ count: 0, average: null, best: null, worst: null })
  })

  test('reports the average, best and worst gross score', () => {
    const rounds = [
      testRound({ id: 'a', date: '2026-05-01', strokes: scoresOfPar() }), // 72
      testRound({ id: 'b', date: '2026-05-08', strokes: scoresOfBogey() }), // 90
      testRound({ id: 'c', date: '2026-05-15', totalStrokes: 81 }),
    ]
    const summary = scoreSummary(rounds, 18)
    expect(summary.count).toBe(3)
    expect(summary.average).toBe(81)
    expect(summary.best?.value).toBe(72)
    expect(summary.best?.roundId).toBe('a')
    expect(summary.worst?.value).toBe(90)
  })

  test('keeps nine hole scores separate from eighteen hole scores', () => {
    const rounds = [
      testRound({ id: 'full', date: '2026-05-01', strokes: scoresOfBogey() }),
      testRound({ id: 'nine', date: '2026-05-08', holeCount: 9, strokes: scoresOfBogey(9) }),
    ]
    expect(scoreSummary(rounds, 18).count).toBe(1)
    expect(scoreSummary(rounds, 9).count).toBe(1)
    expect(scoreSummary(rounds, 9).best?.value).toBe(45)
  })
})

describe('differentialSummary', () => {
  test('ranks rounds by difficulty adjusted result, not raw score', () => {
    const easy = testCourse({
      id: 'easy',
      tee: { ...testCourse().tee, courseRating: 67.0, slope: 110 },
      holes: testHoles(18),
    })
    const hard = testCourse({
      id: 'hard',
      tee: { ...testCourse().tee, courseRating: 76.0, slope: 150 },
      holes: testHoles(18),
    })
    // The same gross 90 is a far better round on the hard course.
    const record = buildScoringRecord([
      testRound({ id: 'easy-90', date: '2026-05-01', strokes: scoresOfBogey(), course: easy }),
      testRound({ id: 'hard-90', date: '2026-05-08', strokes: scoresOfBogey(), course: hard }),
    ])
    const summary = differentialSummary(record)
    expect(summary.best?.roundId).toBe('hard-90')
    expect(summary.worst?.roundId).toBe('easy-90')
  })
})

describe('coursePerformance', () => {
  test('groups rounds by course and averages their differentials', () => {
    const other = testCourse({ id: 'course-2', name: 'Second Links', holes: testHoles(18) })
    const record = buildScoringRecord([
      testRound({ id: 'a', date: '2026-05-01', strokes: scoresOfBogey() }),
      testRound({ id: 'b', date: '2026-05-08', strokes: scoresOfPar() }),
      testRound({ id: 'c', date: '2026-05-15', strokes: scoresOfBogey(), course: other }),
    ])
    const rounds = record.differentials
    const performance = coursePerformance(
      record,
      [
        testRound({ id: 'a', date: '2026-05-01', strokes: scoresOfBogey() }),
        testRound({ id: 'b', date: '2026-05-08', strokes: scoresOfPar() }),
        testRound({ id: 'c', date: '2026-05-15', strokes: scoresOfBogey(), course: other }),
      ],
    )
    expect(rounds).toHaveLength(3)
    expect(performance).toHaveLength(2)

    const testLinks = performance.find((p) => p.courseId === 'course-1')!
    expect(testLinks.roundsPlayed).toBe(2)
    // Differentials 18.0 and 0.0 average to 9.0.
    expect(testLinks.averageDifferential).toBe(9.0)
    expect(testLinks.bestDifferential).toBe(0.0)
  })

  test('orders courses from best average to worst', () => {
    const other = testCourse({ id: 'course-2', name: 'Second Links', holes: testHoles(18) })
    const rounds = [
      testRound({ id: 'a', date: '2026-05-01', strokes: scoresOfBogey() }),
      testRound({ id: 'c', date: '2026-05-15', strokes: scoresOfPar(), course: other }),
    ]
    const performance = coursePerformance(buildScoringRecord(rounds), rounds)
    expect(performance.map((p) => p.courseId)).toEqual(['course-2', 'course-1'])
  })
})

describe('shotStats', () => {
  test('is null when nothing was recorded', () => {
    const stats = shotStats([testRound({ date: '2026-05-01', strokes: scoresOfPar() })])
    expect(stats.averagePutts).toBeNull()
    expect(stats.fairwayHitRate).toBeNull()
    expect(stats.greenInRegulationRate).toBeNull()
  })

  test('averages putts per round over the rounds that recorded them', () => {
    const round = testRound({ date: '2026-05-01', strokes: scoresOfPar() })
    round.holeScores = round.holeScores.map((hole) => ({ ...hole, putts: 2 }))
    const stats = shotStats([round])
    expect(stats.averagePutts).toBe(36)
  })

  test('reports fairways hit as a rate over driving holes only', () => {
    const round = testRound({ date: '2026-05-01', strokes: scoresOfPar() })
    // Par 3s carry no fairway, so only the 14 driving holes count.
    round.holeScores = round.holeScores.map((hole, i) => ({
      ...hole,
      fairwayHit: round.course.holes[i]!.par === 3 ? null : i < 7,
    }))
    const stats = shotStats([round])
    expect(stats.fairwayHoles).toBe(14)
    expect(stats.fairwayHitRate).toBeCloseTo(5 / 14, 3)
  })

  test('reports greens in regulation as a rate over all holes played', () => {
    const round = testRound({ date: '2026-05-01', strokes: scoresOfPar() })
    round.holeScores = round.holeScores.map((hole, i) => ({
      ...hole,
      greenInRegulation: i < 9,
    }))
    const stats = shotStats([round])
    expect(stats.greenInRegulationRate).toBe(0.5)
  })
})
