import { describe, expect, test } from 'vitest'
import { testRound } from '@/test/fixtures'
import { createMemoryRemote, toRows } from './remote'
import { syncOnce } from './engine'
import { emptySyncState, type SyncState } from './types'

const withRound = (id: string, date: string, updatedAt: string, totalStrokes = 90): SyncState => ({
  rounds: [{ round: testRound({ id, date, totalStrokes }), updatedAt }],
  tombstones: [],
})

describe('syncOnce', () => {
  test('uploads a guest record to an empty account', async () => {
    const remote = createMemoryRemote()
    const local = withRound('a', '2026-05-01', '2026-05-01T00:00:00.000Z')

    const outcome = await syncOnce(local, remote, {})

    expect(outcome.pushed).toBe(1)
    expect(outcome.state.rounds).toHaveLength(1)
    expect(await remote.pull(undefined)).toHaveLength(1)
  })

  test('pulls a round posted on another device', async () => {
    const remote = createMemoryRemote()
    await remote.push(toRows(withRound('b', '2026-05-02', '2026-05-02T00:00:00.000Z')))

    const outcome = await syncOnce(emptySyncState(), remote, {})

    expect(outcome.pulled).toBe(1)
    expect(outcome.state.rounds.map((r) => r.round.id)).toEqual(['b'])
  })

  test('a round absent from the delta survives — absence is not deletion', async () => {
    const remote = createMemoryRemote()
    const local = withRound('a', '2026-05-01', '2026-05-01T00:00:00.000Z')
    const first = await syncOnce(local, remote, {})

    // Another device adds an unrelated round afterwards.
    await remote.push(toRows(withRound('b', '2026-05-09', '2026-05-09T00:00:00.000Z')))

    // The second pull returns only 'b'. 'a' must not be read as deleted.
    const second = await syncOnce(first.state, remote, first.cursors)
    expect(second.state.rounds.map((r) => r.round.id)).toEqual(['a', 'b'])
  })

  test('propagates a deletion as a tombstone row, not an omission', async () => {
    const remote = createMemoryRemote()
    const local: SyncState = {
      rounds: [],
      tombstones: [{ id: 'a', deletedAt: '2026-05-03T00:00:00.000Z' }],
    }
    await remote.push(toRows(withRound('a', '2026-05-01', '2026-05-01T00:00:00.000Z')))

    const outcome = await syncOnce(local, remote, {})

    expect(outcome.state.rounds).toEqual([])
    const rows = await remote.pull(undefined)
    expect(rows.find((row) => row.roundId === 'a')!.deletedAt).toBe('2026-05-03T00:00:00.000Z')
  })

  test('does not push back what it just pulled', async () => {
    const remote = createMemoryRemote()
    await remote.push(toRows(withRound('b', '2026-05-02', '2026-05-02T00:00:00.000Z')))
    const outcome = await syncOnce(emptySyncState(), remote, {})
    expect(outcome.pushed).toBe(0)
  })

  test('a second sync with no changes does nothing', async () => {
    const remote = createMemoryRemote()
    const local = withRound('a', '2026-05-01', '2026-05-01T00:00:00.000Z')
    const first = await syncOnce(local, remote, {})
    const second = await syncOnce(first.state, remote, first.cursors)
    expect(second.pushed).toBe(0)
    expect(second.pulled).toBe(0)
    expect(second.state).toEqual(first.state)
  })
})
