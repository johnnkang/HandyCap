import { mergeStates } from './merge'
import { rowStamp, toRows, toSyncState, type RemoteStore } from './remote'
import type { SyncState } from './types'

/**
 * Where this device got to.
 *
 * Both cursors are derived from row timestamps rather than the local clock, so
 * a wrong device clock cannot make the device skip rows it has never seen.
 */
export interface SyncCursors {
  lastPulledAt?: string
  lastPushedAt?: string
}

export interface SyncOutcome {
  state: SyncState
  cursors: SyncCursors
  pulled: number
  pushed: number
}

const highest = (values: string[], fallback?: string): string | undefined =>
  values.reduce<string | undefined>((held, value) => (!held || value > held ? value : held), fallback)

/**
 * One round of sync: pull the delta, merge, hand back the result to persist,
 * and push anything the server has not seen.
 *
 * There is no offline write queue, because the merge is idempotent — a failed
 * sync is simply a sync that has not happened yet.
 */
export async function syncOnce(
  local: SyncState,
  remote: RemoteStore,
  cursors: SyncCursors,
): Promise<SyncOutcome> {
  const pulled = await remote.pull(cursors.lastPulledAt)
  const merged = mergeStates(local, toSyncState(pulled))

  // Rows we have just received are already on the server; pushing them back is
  // harmless but wasteful, so they are skipped by identity.
  const justPulled = new Set(pulled.map((row) => `${row.roundId}@${rowStamp(row)}`))
  const outgoing = toRows(merged).filter((row) => {
    const stamp = rowStamp(row)
    if (justPulled.has(`${row.roundId}@${stamp}`)) return false
    // Strictly newer than the last push. An edit made in the same millisecond
    // as the previous push completed would be skipped, which cannot happen in
    // practice because a push is network I/O — and the alternative (>=) would
    // re-upload the whole record on every idle sync.
    return !cursors.lastPushedAt || stamp > cursors.lastPushedAt
  })

  if (outgoing.length > 0) await remote.push(outgoing)

  return {
    state: merged,
    cursors: {
      // Rows we just pushed are on the server and have been seen, so they
      // advance the pull cursor too. Without this a device that only ever
      // pushes keeps re-pulling its own writes forever.
      lastPulledAt: highest(
        [...pulled.map(rowStamp), ...outgoing.map(rowStamp)],
        cursors.lastPulledAt,
      ),
      lastPushedAt: highest(outgoing.map(rowStamp), cursors.lastPushedAt),
    },
    pulled: pulled.length,
    pushed: outgoing.length,
  }
}
