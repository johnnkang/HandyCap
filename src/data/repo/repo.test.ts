import { describe, expect, test } from 'vitest'
import { createMemoryStore } from './store'
import { createRepository, CURRENT_SCHEMA_VERSION } from './repository'
import { scoresOfBogey, testRound } from '@/test/fixtures'
import { emptySyncState } from '@/data/sync/types'

const newRepo = () => createRepository(createMemoryStore())

describe('repository', () => {
  test('starts empty', async () => {
    expect(await newRepo().loadRounds()).toEqual([])
  })

  test('saves and reloads a round', async () => {
    const repo = newRepo()
    const round = testRound({ date: '2026-05-01', strokes: scoresOfBogey() })
    await repo.saveRound(round)
    expect(await repo.loadRounds()).toEqual([round])
  })

  test('replaces a round saved under the same id', async () => {
    const repo = newRepo()
    await repo.saveRound(testRound({ id: 'r1', date: '2026-05-01', totalStrokes: 90 }))
    await repo.saveRound(testRound({ id: 'r1', date: '2026-05-01', totalStrokes: 84 }))
    const rounds = await repo.loadRounds()
    expect(rounds).toHaveLength(1)
    expect(rounds[0]!.totalStrokes).toBe(84)
  })

  test('keeps rounds in date order', async () => {
    const repo = newRepo()
    await repo.saveRound(testRound({ id: 'b', date: '2026-05-15', totalStrokes: 90 }))
    await repo.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))
    expect((await repo.loadRounds()).map((r) => r.id)).toEqual(['a', 'b'])
  })

  test('deletes a round', async () => {
    const repo = newRepo()
    await repo.saveRound(testRound({ id: 'r1', date: '2026-05-01', totalStrokes: 90 }))
    await repo.deleteRound('r1')
    expect(await repo.loadRounds()).toEqual([])
  })

  test('exports and reimports the whole record', async () => {
    const repo = newRepo()
    const round = testRound({ date: '2026-05-01', strokes: scoresOfBogey() })
    await repo.saveRound(round)

    const exported = await repo.exportJson()
    expect(JSON.parse(exported).schemaVersion).toBe(CURRENT_SCHEMA_VERSION)

    const restored = newRepo()
    await restored.importJson(exported)
    expect(await restored.loadRounds()).toEqual([round])
  })

  test('refuses an import from a newer schema it cannot understand', async () => {
    const repo = newRepo()
    const future = JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION + 1, rounds: [] })
    await expect(repo.importJson(future)).rejects.toThrow(/newer version/i)
  })

  test('refuses an import that is not a HandyCap export', async () => {
    await expect(newRepo().importJson('{"nope":true}')).rejects.toThrow()
  })
})

describe('repository sync state', () => {
  const fixedNow = () => '2026-06-01T00:00:00.000Z'
  const syncRepo = () => createRepository(createMemoryStore(), { now: fixedNow })

  test('stamps a saved round with the time it was written', async () => {
    const repo = syncRepo()
    await repo.saveRound(testRound({ id: 'r1', date: '2026-05-01', totalStrokes: 90 }))
    const state = await repo.loadState()
    expect(state.rounds).toHaveLength(1)
    expect(state.rounds[0]!.updatedAt).toBe('2026-06-01T00:00:00.000Z')
  })

  test('leaves a tombstone when a round is deleted', async () => {
    const repo = syncRepo()
    await repo.saveRound(testRound({ id: 'r1', date: '2026-05-01', totalStrokes: 90 }))
    await repo.deleteRound('r1')
    const state = await repo.loadState()
    expect(state.rounds).toEqual([])
    expect(state.tombstones).toEqual([{ id: 'r1', deletedAt: '2026-06-01T00:00:00.000Z' }])
  })

  test('replaceState swaps the whole record, as a completed sync does', async () => {
    const repo = syncRepo()
    const round = testRound({ id: 'r9', date: '2026-05-05', totalStrokes: 85 })
    await repo.replaceState({
      ...emptySyncState(),
      rounds: [{ round, updatedAt: '2026-05-05T00:00:00.000Z' }],
    })
    expect(await repo.loadRounds()).toEqual([round])
  })

  test('migrates a v1 record, stamping rounds with the migration time', async () => {
    const store = createMemoryStore()
    const round = testRound({ id: 'old', date: '2026-04-01', totalStrokes: 88 })
    // Exactly what v1 wrote: a bare array under the rounds key.
    await store.set('handycap:rounds', [round])
    await store.set('handycap:schemaVersion', 1)

    const repo = createRepository(store, { now: fixedNow })
    expect(await repo.loadRounds()).toEqual([round])
    const state = await repo.loadState()
    expect(state.rounds[0]!.updatedAt).toBe('2026-06-01T00:00:00.000Z')
    expect(await store.get('handycap:schemaVersion')).toBe(2)
  })

  test('an imported round is stamped so it will sync', async () => {
    const source = syncRepo()
    await source.saveRound(testRound({ id: 'r1', date: '2026-05-01', totalStrokes: 90 }))
    const exported = await source.exportJson()

    const target = createRepository(createMemoryStore(), { now: () => '2026-07-01T00:00:00.000Z' })
    await target.importJson(exported)
    expect((await target.loadState()).rounds[0]!.updatedAt).toBe('2026-07-01T00:00:00.000Z')
  })
})
