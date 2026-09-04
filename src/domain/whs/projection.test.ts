import { describe, expect, test } from 'vitest'
import {
  projectIndex,
  scoreForDifferential,
  differentialForScore,
  nextRollOff,
  trajectory,
  differentialNeededNextRound,
  roundsToReachTarget,
  recentForm,
} from './projection'
import { buildScoringRecord } from './scoringRecord'
import { scoresOfBogey, testRound } from '@/test/fixtures'

const neutralTee = { slope: 113, courseRating: 72.0, par: 72 }

/** A record of `n` rounds of 90 on the neutral course: every differential 18.0. */
const recordOfBogeyRounds = (n: number) => {
  const rounds = Array.from({ length: n }, (_, i) => {
    const day = String(i + 1).padStart(2, '0')
    return testRound({ id: `r${i}`, date: `2026-03-${day}`, strokes: scoresOfBogey() })
  })
  return buildScoringRecord(rounds)
}

describe('differentialForScore and scoreForDifferential', () => {
  test('convert a score to a differential on a neutral course', () => {
    expect(differentialForScore(85, neutralTee)).toBe(13.0)
  })

  test('convert a differential back to the score that produces it', () => {
    expect(scoreForDifferential(13.0, neutralTee)).toBe(85)
  })

  test('round trip on a hard course', () => {
    const hard = { slope: 144, courseRating: 74.9, par: 72 }
    const differential = differentialForScore(95, hard)
    expect(scoreForDifferential(differential, hard)).toBe(95)
  })
})

describe('projectIndex', () => {
  test('a great next round lowers the projected index', () => {
    const record = recordOfBogeyRounds(20)
    expect(record.index).toBe(18.0)
    // Replaces one 18.0 in the window with a 5.0: lowest eight become
    // 5.0 and seven 18.0s -> 131 / 8 = 16.375 -> 16.4, before Rule 5.9.
    const projected = projectIndex(record, 5.0)
    expect(projected).toBeLessThan(18.0)
  })

  test('a poor next round does not move an index built on better rounds', () => {
    const record = recordOfBogeyRounds(20)
    expect(projectIndex(record, 40.0)).toBe(18.0)
  })

  test('returns an index for a player who is one round short of qualifying', () => {
    const record = recordOfBogeyRounds(2)
    expect(record.index).toBeNull()
    expect(projectIndex(record, 18.0)).toBe(16.0)
  })
})

describe('nextRollOff', () => {
  test('is null before the record is full', () => {
    expect(nextRollOff(recordOfBogeyRounds(10))).toBeNull()
  })

  test('names the oldest differential once the record is full', () => {
    const record = recordOfBogeyRounds(20)
    expect(nextRollOff(record)?.roundId).toBe('r0')
  })
})

describe('recentForm', () => {
  test('averages the most recent differentials', () => {
    const record = recordOfBogeyRounds(6)
    expect(recentForm(record, 5)).toBe(18.0)
  })

  test('is null with no differentials', () => {
    expect(recentForm(recordOfBogeyRounds(0), 5)).toBeNull()
  })
})

describe('trajectory', () => {
  test('holds steady when future rounds match recent form', () => {
    const record = recordOfBogeyRounds(20)
    const path = trajectory(record, 18.0, 5)
    expect(path).toHaveLength(5)
    expect(path.every((point) => point.index === 18.0)).toBe(true)
  })

  test('improves steadily when future rounds beat recent form', () => {
    const record = recordOfBogeyRounds(20)
    const path = trajectory(record, 8.0, 8)
    expect(path[7]!.index).toBeLessThan(path[0]!.index!)
  })
})

describe('differentialNeededNextRound', () => {
  test('finds the differential that reaches a modest target in one round', () => {
    const record = recordOfBogeyRounds(20)
    const needed = differentialNeededNextRound(record, 17.5)
    expect(needed).not.toBeNull()
    expect(projectIndex(record, needed!)).toBeLessThanOrEqual(17.5)
  })

  test('is null when no single round can reach the target', () => {
    const record = recordOfBogeyRounds(20)
    expect(differentialNeededNextRound(record, 2.0)).toBeNull()
  })
})

describe('roundsToReachTarget', () => {
  test('is zero when the target is already met', () => {
    expect(roundsToReachTarget(recordOfBogeyRounds(20), 20.0, 18.0)).toBe(0)
  })

  test('counts the rounds of steady form needed to reach a target', () => {
    const record = recordOfBogeyRounds(20)
    const rounds = roundsToReachTarget(record, 12.0, 10.0)
    expect(rounds).toBeGreaterThan(0)
    expect(rounds).toBeLessThanOrEqual(20)
  })

  test('is null when the assumed form can never reach the target', () => {
    const record = recordOfBogeyRounds(20)
    expect(roundsToReachTarget(record, 5.0, 18.0)).toBeNull()
  })
})
