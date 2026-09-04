import { describe, expect, test } from 'vitest'
import { roundViews } from './roundViews'
import { buildScoringRecord } from '@/domain/whs/scoringRecord'
import { scoresOfBogey, scoresOfPar, testRound } from '@/test/fixtures'

const viewsFor = (rounds: Parameters<typeof buildScoringRecord>[0]) =>
  roundViews(rounds, buildScoringRecord(rounds))

describe('roundViews', () => {
  test('lists rounds newest first', () => {
    const views = viewsFor([
      testRound({ id: 'a', date: '2026-05-01', strokes: scoresOfBogey() }),
      testRound({ id: 'b', date: '2026-05-08', strokes: scoresOfBogey() }),
      testRound({ id: 'c', date: '2026-05-15', strokes: scoresOfBogey() }),
    ])
    expect(views.map((view) => view.round.id)).toEqual(['c', 'b', 'a'])
  })

  test('carries the gross score and differential of an eighteen hole round', () => {
    const [view] = viewsFor([testRound({ id: 'a', date: '2026-05-01', strokes: scoresOfBogey() })])
    expect(view!.grossScore).toBe(90)
    expect(view!.differential).toBe(18.0)
    expect(view!.pending).toBe(false)
  })

  test('marks the rounds currently counting toward the index', () => {
    const views = viewsFor([
      testRound({ id: 'a', date: '2026-05-01', strokes: scoresOfPar() }),
      testRound({ id: 'b', date: '2026-05-08', strokes: scoresOfBogey() }),
      testRound({ id: 'c', date: '2026-05-15', strokes: scoresOfBogey() }),
    ])
    // Three scores count only the lowest one, which is the round played at par.
    expect(views.find((view) => view.round.id === 'a')!.counting).toBe(true)
    expect(views.find((view) => view.round.id === 'b')!.counting).toBe(false)
  })

  test('marks a lone nine as pending', () => {
    const [view] = viewsFor([
      testRound({ id: 'n1', date: '2026-05-01', holeCount: 9, strokes: scoresOfBogey(9) }),
    ])
    expect(view!.pending).toBe(true)
    expect(view!.differential).toBeNull()
    expect(view!.grossScore).toBe(45)
  })

  test('shows a paired nine on the round that completed the pair', () => {
    const views = viewsFor([
      testRound({ id: 'n1', date: '2026-05-01', holeCount: 9, strokes: scoresOfBogey(9) }),
      testRound({ id: 'n2', date: '2026-05-08', holeCount: 9, strokes: scoresOfBogey(9) }),
    ])
    const second = views.find((view) => view.round.id === 'n2')!
    const first = views.find((view) => view.round.id === 'n1')!

    expect(second.differential).toBe(18.0)
    expect(second.pairedWith).toBe('n1')
    expect(first.differential).toBeNull()
    expect(first.contributedToPair).toBe(true)
    expect(first.pending).toBe(false)
  })
})
