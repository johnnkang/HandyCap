/**
 * Two devices, one account, edits made while offline.
 *
 * Each `device` is a real repository over its own in-memory store, sharing one
 * fake remote — the same code path the app runs, minus the network.
 */
import { describe, expect, test } from 'vitest'
import { testRound } from '@/test/fixtures'
import { createRepository, type Repository } from '@/data/repo/repository'
import { createMemoryStore } from '@/data/repo/store'
import { createMemoryRemote, type RemoteStore } from './remote'
import { syncOnce, type SyncCursors } from './engine'

function device(clock: { at: string }) {
  const repo: Repository = createRepository(createMemoryStore(), { now: () => clock.at })
  let cursors: SyncCursors = {}
  return {
    repo,
    async sync(remote: RemoteStore) {
      const outcome = await syncOnce(await repo.loadState(), remote, cursors)
      await repo.replaceState(outcome.state)
      cursors = outcome.cursors
      return outcome
    },
  }
}

const ids = async (repo: Repository) => (await repo.loadRounds()).map((round) => round.id)

describe('two devices sharing one account', () => {
  test('a round posted on one device reaches the other', async () => {
    const remote = createMemoryRemote()
    const clockA = { at: '2026-05-01T00:00:00.000Z' }
    const clockB = { at: '2026-05-01T00:00:00.000Z' }
    const phone = device(clockA)
    const tablet = device(clockB)

    await phone.repo.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))
    await phone.sync(remote)
    await tablet.sync(remote)

    expect(await ids(tablet.repo)).toEqual(['a'])
  })

  test.each([
    ['the phone reaches the network first', false],
    ['the tablet reaches the network first', true],
  ])('offline edits on both devices converge when %s', async (_name, tabletFirst) => {
    const remote = createMemoryRemote()
    const phone = device({ at: '2026-05-02T00:00:00.000Z' })
    const tablet = device({ at: '2026-05-03T00:00:00.000Z' })

    await phone.repo.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))
    await tablet.repo.saveRound(testRound({ id: 'b', date: '2026-05-02', totalStrokes: 85 }))

    // Running both orders is the point: convergence that only holds when one
    // particular device syncs first is not convergence.
    const order = tabletFirst ? [tablet, phone, tablet] : [phone, tablet, phone]
    for (const next of order) await next.sync(remote)

    expect(await ids(phone.repo)).toEqual(['a', 'b'])
    expect(await ids(tablet.repo)).toEqual(['a', 'b'])
  })

  test('a delete on one device does not come back from the other', async () => {
    const remote = createMemoryRemote()
    const clockA = { at: '2026-05-02T00:00:00.000Z' }
    const clockB = { at: '2026-05-02T00:00:00.000Z' }
    const phone = device(clockA)
    const tablet = device(clockB)

    await phone.repo.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))
    await phone.sync(remote)
    await tablet.sync(remote)
    expect(await ids(tablet.repo)).toEqual(['a'])

    // Deleted on the phone, later than the write.
    clockA.at = '2026-05-04T00:00:00.000Z'
    await phone.repo.deleteRound('a')
    await phone.sync(remote)

    // The tablet still holds it, and syncing must remove it — twice over.
    await tablet.sync(remote)
    expect(await ids(tablet.repo)).toEqual([])
    await tablet.sync(remote)
    await phone.sync(remote)
    expect(await ids(tablet.repo)).toEqual([])
    expect(await ids(phone.repo)).toEqual([])
  })

  test('a backdated round syncs and the other device recomputes from it', async () => {
    const remote = createMemoryRemote()
    const clockA = { at: '2026-05-10T00:00:00.000Z' }
    const clockB = { at: '2026-05-10T00:00:00.000Z' }
    const phone = device(clockA)
    const tablet = device(clockB)

    await phone.repo.saveRound(testRound({ id: 'recent', date: '2026-05-09', totalStrokes: 90 }))
    await phone.sync(remote)
    await tablet.sync(remote)

    // A round from months ago, entered late. It has to reach the other device
    // and land in date order — the order each device replays its record in.
    clockA.at = '2026-05-11T00:00:00.000Z'
    await phone.repo.saveRound(testRound({ id: 'old', date: '2026-01-04', totalStrokes: 95 }))
    await phone.sync(remote)
    await tablet.sync(remote)

    expect(await ids(tablet.repo)).toEqual(['old', 'recent'])
  })

  test('the later edit of the same round wins on both devices', async () => {
    const remote = createMemoryRemote()
    const clockA = { at: '2026-05-02T00:00:00.000Z' }
    const clockB = { at: '2026-05-05T00:00:00.000Z' }
    const phone = device(clockA)
    const tablet = device(clockB)

    await phone.repo.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))
    await phone.sync(remote)
    await tablet.sync(remote)

    // Both correct the same round offline; the tablet's clock is later.
    await phone.repo.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 88 }))
    await tablet.repo.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 84 }))

    await phone.sync(remote)
    await tablet.sync(remote)
    await phone.sync(remote)

    const onPhone = (await phone.repo.loadRounds())[0]!
    const onTablet = (await tablet.repo.loadRounds())[0]!
    expect(onPhone.totalStrokes).toBe(84)
    expect(onTablet.totalStrokes).toBe(84)
  })
})
