import { describe, expect, test } from 'vitest'
import { parTypeStats } from './parTypeStats'
import { scoresOfPar, scoresOfBogey, testRound } from '@/test/fixtures'

describe('parTypeStats', () => {
  test('has nothing to report without rounds', () => {
    const stats = parTypeStats([])
    expect(stats.byPar).toEqual([])
    expect(stats.strongest).toBeNull()
  })

  test('ignores quick total rounds, which carry no hole detail', () => {
    const stats = parTypeStats([testRound({ date: '2026-05-01', totalStrokes: 88 })])
    expect(stats.byPar).toEqual([])
  })

  test('a round played at par is level on every par type', () => {
    const stats = parTypeStats([testRound({ date: '2026-05-01', strokes: scoresOfPar() })])
    for (const parType of stats.byPar) {
      expect(parType.averageOverPar).toBe(0)
    }
  })

  test('counts how many holes of each par type were played', () => {
    // The test course has four par 3s, ten par 4s and four par 5s.
    const stats = parTypeStats([testRound({ date: '2026-05-01', strokes: scoresOfPar() })])
    expect(stats.byPar.find((p) => p.par === 3)!.holesPlayed).toBe(4)
    expect(stats.byPar.find((p) => p.par === 4)!.holesPlayed).toBe(10)
    expect(stats.byPar.find((p) => p.par === 5)!.holesPlayed).toBe(4)
  })

  test('identifies the par type a player is strongest on', () => {
    // Par at every par 5, bogey everywhere else.
    const strokes = scoresOfBogey()
    const pars = scoresOfPar()
    for (let i = 0; i < 18; i++) {
      if (pars[i] === 5) strokes[i] = 5
    }
    const stats = parTypeStats([testRound({ date: '2026-05-01', strokes })])

    expect(stats.byPar.find((p) => p.par === 5)!.averageOverPar).toBe(0)
    expect(stats.byPar.find((p) => p.par === 4)!.averageOverPar).toBe(1)
    expect(stats.strongest).toBe(5)
  })

  test('measures each par type against the player own baseline', () => {
    const strokes = scoresOfBogey()
    const pars = scoresOfPar()
    for (let i = 0; i < 18; i++) {
      if (pars[i] === 5) strokes[i] = 5
    }
    const stats = parTypeStats([testRound({ date: '2026-05-01', strokes })])
    // Overall: 14 holes at +1 and 4 at level = 14/18 = 0.78 over par per hole.
    expect(stats.overallOverPar).toBeCloseTo(0.78, 2)
    // Par 5s sit 0.78 below that baseline, so the value is negative.
    expect(stats.byPar.find((p) => p.par === 5)!.relativeToOverall).toBeCloseTo(-0.78, 2)
    expect(stats.byPar.find((p) => p.par === 4)!.relativeToOverall).toBeCloseTo(0.22, 2)
  })

  test('breaks scoring down into birdies, pars and bogeys', () => {
    const strokes = scoresOfPar()
    strokes[0] = 3 // birdie on a par 4
    strokes[1] = 6 // double bogey on a par 4
    strokes[9] = 8 // triple or worse on a par 4
    const stats = parTypeStats([testRound({ date: '2026-05-01', strokes })])

    const parFours = stats.byPar.find((p) => p.par === 4)!
    expect(parFours.distribution.birdie).toBe(1)
    expect(parFours.distribution.doubleBogey).toBe(1)
    expect(parFours.distribution.tripleOrWorse).toBe(1)
    expect(parFours.distribution.par).toBe(7)
  })

  test('aggregates across several rounds', () => {
    const stats = parTypeStats([
      testRound({ id: 'a', date: '2026-05-01', strokes: scoresOfPar() }),
      testRound({ id: 'b', date: '2026-05-08', strokes: scoresOfBogey() }),
    ])
    expect(stats.byPar.find((p) => p.par === 3)!.holesPlayed).toBe(8)
    expect(stats.byPar.find((p) => p.par === 3)!.averageOverPar).toBe(0.5)
  })

  test('skips holes that were not played', () => {
    const strokes: (number | null)[] = scoresOfPar()
    strokes[2] = null // a par 3
    const stats = parTypeStats([testRound({ date: '2026-05-01', strokes })])
    expect(stats.byPar.find((p) => p.par === 3)!.holesPlayed).toBe(3)
  })
})
