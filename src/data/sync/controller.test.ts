import { describe, expect, test } from 'vitest'
import { testRound } from '@/test/fixtures'
import { createRepository } from '@/data/repo/repository'
import { createMemoryStore } from '@/data/repo/store'
import { createMemoryRemote } from './remote'
import { createSyncController } from './controller'

const setup = () => {
  const store = createMemoryStore()
  const repository = createRepository(store, { now: () => '2026-05-01T00:00:00.000Z' })
  const remote = createMemoryRemote()
  const controller = createSyncController({ repository, store, remote, accountId: 'acct-1' })
  return { store, repository, remote, controller }
}

describe('sync controller', () => {
  test('writes the merged result back to the repository', async () => {
    const { repository, controller } = setup()
    await repository.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))
    await controller.sync()
    expect((await repository.loadRounds()).map((r) => r.id)).toEqual(['a'])
  })

  test('remembers its cursors across controller instances', async () => {
    const { store, repository, remote, controller } = setup()
    await repository.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))
    await controller.sync()

    const revived = createSyncController({ repository, store, remote, accountId: 'acct-1' })
    const outcome = await revived.sync()
    expect(outcome.pushed).toBe(0)
  })

  test('keeps cursors separate per account', async () => {
    const { store, repository, controller } = setup()
    await repository.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))
    await controller.sync()

    // A different account has its own remote and its own cursors, so the record
    // uploads again rather than being mistaken for already synced.
    const other = createSyncController({
      repository,
      store,
      remote: createMemoryRemote(),
      accountId: 'acct-2',
    })
    const outcome = await other.sync()
    expect(outcome.pushed).toBeGreaterThan(0)
  })

  test('lets a failure propagate without corrupting local data', async () => {
    const { repository } = setup()
    await repository.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))
    const broken = createSyncController({
      repository,
      store: createMemoryStore(),
      accountId: 'acct-1',
      remote: {
        pull: async () => {
          throw new Error('offline')
        },
        push: async () => {},
        deleteEverything: async () => {},
      },
    })

    await expect(broken.sync()).rejects.toThrow('offline')
    expect((await repository.loadRounds()).map((r) => r.id)).toEqual(['a'])
  })
})
