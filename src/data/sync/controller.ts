import type { Repository } from '@/data/repo/repository'
import type { KeyValueStore } from '@/data/repo/store'
import { syncOnce, type SyncCursors, type SyncOutcome } from './engine'
import type { RemoteStore } from './remote'

export interface SyncController {
  sync(): Promise<SyncOutcome>
}

export interface SyncControllerOptions {
  repository: Repository
  store: KeyValueStore
  remote: RemoteStore
  accountId: string
}

/** Cursors are per account, so signing into a different one starts clean. */
const cursorKey = (accountId: string) => `handycap:cursors:${accountId}`

export function createSyncController({
  repository,
  store,
  remote,
  accountId,
}: SyncControllerOptions): SyncController {
  return {
    async sync() {
      const cursors = (await store.get<SyncCursors>(cursorKey(accountId))) ?? {}
      // A throw here leaves local data exactly as it was: nothing is written
      // until the merge has come back whole.
      const outcome = await syncOnce(await repository.loadState(), remote, cursors)
      await repository.replaceState(outcome.state)
      await store.set(cursorKey(accountId), outcome.cursors)
      return outcome
    },
  }
}
