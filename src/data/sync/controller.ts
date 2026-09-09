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

/**
 * Cursors are per account, so signing into a different one starts clean.
 *
 * Exported so an undo that signs out can also clear this account's cursors —
 * without that, a later sign-in to the same account would resume from a
 * cursor already past the merged record and never re-adopt it.
 */
export const cursorKey = (accountId: string) => `handycap:cursors:${accountId}`

export function createSyncController({
  repository,
  store,
  remote,
  accountId,
}: SyncControllerOptions): SyncController {
  return {
    async sync() {
      const cursors = (await store.get<SyncCursors>(cursorKey(accountId))) ?? {}
      // A throw here — pulling or pushing — leaves local data exactly as it
      // was: nothing is written until the merge has come back whole.
      const outcome = await syncOnce(await repository.loadState(), remote, cursors)
      // The record first, then the cursors. If the cursor write fails, the next
      // sync re-pulls and re-pushes rows the server already has, which the
      // merge absorbs idempotently. The reverse order would record progress for
      // a record that was never written.
      await repository.replaceState(outcome.state)
      await store.set(cursorKey(accountId), outcome.cursors)
      return outcome
    },
  }
}
