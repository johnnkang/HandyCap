import { describe, expect, test } from 'vitest'
import { testRound } from '@/test/fixtures'
import { mergeStates } from './merge'
import { emptySyncState, type SyncState } from './types'

const at = (id: string, date: string, updatedAt: string, totalStrokes = 90) => ({
  round: testRound({ id, date, totalStrokes }),
  updatedAt,
})

const state = (partial: Partial<SyncState>): SyncState => ({ ...emptySyncState(), ...partial })

describe('mergeStates', () => {
  test('keeps rounds that only one side has', () => {
    const local = state({ rounds: [at('a', '2026-05-01', '2026-05-01T00:00:00.000Z')] })
    const remote = state({ rounds: [at('b', '2026-05-02', '2026-05-02T00:00:00.000Z')] })
    expect(mergeStates(local, remote).rounds.map((r) => r.round.id)).toEqual(['a', 'b'])
  })

  test('the later write wins for the same round', () => {
    const local = state({ rounds: [at('a', '2026-05-01', '2026-05-01T00:00:00.000Z', 90)] })
    const remote = state({ rounds: [at('a', '2026-05-01', '2026-05-03T00:00:00.000Z', 84)] })
    const merged = mergeStates(local, remote)
    expect(merged.rounds).toHaveLength(1)
    expect(merged.rounds[0]!.round.totalStrokes).toBe(84)
  })

  test('a delete newer than the write removes the round', () => {
    const local = state({ rounds: [at('a', '2026-05-01', '2026-05-01T00:00:00.000Z')] })
    const remote = state({ tombstones: [{ id: 'a', deletedAt: '2026-05-02T00:00:00.000Z' }] })
    const merged = mergeStates(local, remote)
    expect(merged.rounds).toEqual([])
    expect(merged.tombstones).toEqual([{ id: 'a', deletedAt: '2026-05-02T00:00:00.000Z' }])
  })

  test('a write newer than the delete brings the round back', () => {
    const local = state({ tombstones: [{ id: 'a', deletedAt: '2026-05-01T00:00:00.000Z' }] })
    const remote = state({ rounds: [at('a', '2026-05-01', '2026-05-02T00:00:00.000Z')] })
    expect(mergeStates(local, remote).rounds.map((r) => r.round.id)).toEqual(['a'])
  })

  test('a tie prefers the deletion, because resurrection is the worse failure', () => {
    const same = '2026-05-01T00:00:00.000Z'
    const local = state({ rounds: [at('a', '2026-05-01', same)] })
    const remote = state({ tombstones: [{ id: 'a', deletedAt: same }] })
    expect(mergeStates(local, remote).rounds).toEqual([])
  })

  test('keeps the tombstone so a later sync cannot resurrect the round', () => {
    const local = state({ tombstones: [{ id: 'a', deletedAt: '2026-05-02T00:00:00.000Z' }] })
    const merged = mergeStates(local, emptySyncState())
    const again = mergeStates(merged, state({ rounds: [at('a', '2026-05-01', '2026-05-01T00:00:00.000Z')] }))
    expect(again.rounds).toEqual([])
  })

  test('orders rounds by date then id, so output is deterministic', () => {
    const local = state({
      rounds: [
        at('z', '2026-05-09', '2026-05-09T00:00:00.000Z'),
        at('a', '2026-05-01', '2026-05-01T00:00:00.000Z'),
      ],
    })
    expect(mergeStates(local, emptySyncState()).rounds.map((r) => r.round.id)).toEqual(['a', 'z'])
  })
})
