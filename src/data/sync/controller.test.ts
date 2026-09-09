import { describe, expect, test } from 'vitest'
import { testRound } from '@/test/fixtures'
import { createRepository } from '@/data/repo/repository'
import { createMemoryStore } from '@/data/repo/store'
import { createMemoryRemote, type RemoteStore } from './remote'
import { createSyncController } from './controller'

/** A remote whose pull hangs until the test lets it through. */
const gatedRemote = (inner: RemoteStore) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let open = false
  const remote: RemoteStore = {
    ...inner,
    async pull(since) {
      if (!open) await gate
      return inner.pull(since)
    },
  }
  return {
    remote,
    open() {
      open = true
      release()
    },
  }
}

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

  test('a round saved while the sync is in flight is not overwritten', async () => {
    // The trigger is ordinary: the app syncs on foreground, the signal at the
    // course is slow, and the golfer taps + and posts a round two seconds
    // later. That round exists nowhere but this device.
    const store = createMemoryStore()
    const repository = createRepository(store, { now: () => '2026-05-01T00:00:00.000Z' })
    const server = createMemoryRemote()
    const { remote, open } = gatedRemote(server)
    const controller = createSyncController({ repository, store, remote, accountId: 'acct-1' })

    await repository.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))
    const inFlight = controller.sync()
    await repository.saveRound(testRound({ id: 'b', date: '2026-05-02', totalStrokes: 88 }))
    open()
    await inFlight

    expect((await repository.loadRounds()).map((round) => round.id)).toEqual(['a', 'b'])

    // It was never pushed, so it is not under the cursor's high-water mark and
    // the next sync uploads it.
    await controller.sync()
    expect((await server.pull(undefined)).map((row) => row.roundId).sort()).toEqual(['a', 'b'])
  })

  test('a round deleted while the sync is in flight stays deleted', async () => {
    // The other side of the re-merge: the tombstone is newer than the round the
    // sync started from, so re-reading cannot resurrect what was just deleted.
    const store = createMemoryStore()
    let tick = 0
    const repository = createRepository(store, {
      now: () => `2026-05-01T00:00:0${++tick}.000Z`,
    })
    const { remote, open } = gatedRemote(createMemoryRemote())
    const controller = createSyncController({ repository, store, remote, accountId: 'acct-1' })

    await repository.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))
    const inFlight = controller.sync()
    await repository.deleteRound('a')
    open()
    await inFlight

    expect(await repository.loadRounds()).toEqual([])
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

  test('a failure while pushing leaves local data and cursors untouched', async () => {
    const { repository } = setup()
    await repository.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))

    // The other half of the failure story: the pull and the merge both succeed,
    // and the network dies on the way back up.
    const store = createMemoryStore()
    const broken = createSyncController({
      repository,
      store,
      accountId: 'acct-1',
      remote: {
        pull: async () => [],
        push: async () => {
          throw new Error('offline mid-push')
        },
        deleteEverything: async () => {},
      },
    })

    await expect(broken.sync()).rejects.toThrow('offline mid-push')
    expect((await repository.loadRounds()).map((round) => round.id)).toEqual(['a'])
    // No cursor was recorded either, so the next attempt does not believe it
    // has already pushed the round.
    expect(await store.get('handycap:cursors:acct-1')).toBeUndefined()
  })
})
