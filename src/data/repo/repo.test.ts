import { describe, expect, test } from 'vitest'
import { createMemoryStore } from './store'
import { createRepository, CURRENT_SCHEMA_VERSION } from './repository'
import { scoresOfBogey, testRound } from '@/test/fixtures'

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
