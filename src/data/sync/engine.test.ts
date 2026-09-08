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

  test('an idle device settles into pulling and pushing nothing', async () => {
    const remote = createMemoryRemote()
    const local = withRound('a', '2026-05-01', '2026-05-01T00:00:00.000Z')

    const first = await syncOnce(local, remote, {})
    expect(first.pushed).toBe(1)

    // The first sync pulled nothing, so its cursor is still unset and this one
    // is handed back the row it wrote. It must not push it a second time.
    const second = await syncOnce(first.state, remote, first.cursors)
    expect(second.pushed).toBe(0)
    expect(second.state).toEqual(first.state)

    // The cursor has advanced now, so the device is fully idle.
    const third = await syncOnce(second.state, remote, second.cursors)
    expect(third.pulled).toBe(0)
    expect(third.pushed).toBe(0)
    expect(third.state).toEqual(first.state)
  })

  test('a device with a fast clock can still see other devices', async () => {
    const remote = createMemoryRemote()

    // This device's clock is years ahead.
    const skewed = withRound('mine', '2026-05-01', '2030-01-01T00:00:00.000Z')
    let cursors = (await syncOnce(skewed, remote, {})).cursors
    cursors = (await syncOnce(skewed, remote, cursors)).cursors

    // Another device, clock correct, posts a round.
    await remote.push(toRows(withRound('theirs', '2026-05-02', '2026-09-08T00:00:00.000Z')))

    // A cursor built from client timestamps would sit at 2030 and filter this
    // row out forever. A server-assigned cursor cannot.
    const outcome = await syncOnce(skewed, remote, cursors)
    expect(outcome.state.rounds.map((entry) => entry.round.id).sort()).toEqual([
      'mine',
      'theirs',
    ])
  })

  test('a round stamped earlier than an earlier push still uploads', async () => {
    const remote = createMemoryRemote()
    const first = await syncOnce(
      withRound('a', '2026-05-01', '2026-06-01T00:00:00.000Z'),
      remote,
      {},
    )

    // A second round carrying an earlier stamp — a corrected clock, or a round
    // entered late. A single high-water mark would drop it permanently.
    const local: SyncState = {
      rounds: [
        ...first.state.rounds,
        {
          round: testRound({ id: 'b', date: '2026-04-01', totalStrokes: 88 }),
          updatedAt: '2026-05-15T00:00:00.000Z',
        },
      ],
      tombstones: [],
    }

    const second = await syncOnce(local, remote, first.cursors)
    expect(second.pushed).toBe(1)
    expect((await remote.pull(undefined)).map((row) => row.roundId).sort()).toEqual(['a', 'b'])
  })

  test('the merge winner reaches the server even when both sides tie on a stamp', async () => {
    const tie = '2026-05-01T00:00:00.000Z'
    // Same round, same instant, different score. The merge breaks the tie on
    // content; whichever it picks has to end up on the server, or the two
    // devices disagree permanently.
    const remote = createMemoryRemote(toRows(withRound('a', '2026-05-01', tie, 84)))
    const local = withRound('a', '2026-05-01', tie, 90)

    const outcome = await syncOnce(local, remote, {})

    const [row] = await remote.pull(undefined)
    expect(row!.payload!.totalStrokes).toBe(outcome.state.rounds[0]!.round.totalStrokes)
  })
})
