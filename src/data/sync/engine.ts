import { mergeStates } from './merge'
import { rowStamp, toRows, toSyncState, type RemoteStore } from './remote'
import type { SyncState } from './types'

/**
 * Where this device got to.
 *
 * Two different mechanisms deliberately, because they answer two different
 * questions and only one of them can trust a client clock.
 */
export interface SyncCursors {
  /**
   * High-water mark over server-assigned cursors. Advances ONLY on an actual
   * pull — never from rows this device pushed, because a device whose clock
   * runs fast would otherwise carry its cursor past rows other devices had not
   * written yet, and never be given them again.
   */
  lastPulledCursor?: string
  /**
   * roundId -> the stamp this device last got onto the server. Exact, so a
   * round stamped earlier than a previous push (a corrected clock, a round
   * entered late) still uploads instead of falling under a high-water mark
   * forever. Bounded by the number of rounds, which is tens.
   */
  pushed?: Record<string, string>
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
 * sync is simply a sync that has not happened yet. There is no clock either:
 * every cursor comes from the data, so a wrong device clock cannot make this
 * device skip rows it has never seen.
 */
export async function syncOnce(
  local: SyncState,
  remote: RemoteStore,
  cursors: SyncCursors,
): Promise<SyncOutcome> {
  const pulled = await remote.pull(cursors.lastPulledCursor)
  const merged = mergeStates(local, toSyncState(pulled))

  // Everything the server is known to hold, per round: what it just handed us,
  // on top of what this device has already put there.
  const onServer: Record<string, string> = { ...cursors.pushed }
  for (const row of pulled) onServer[row.roundId] = rowStamp(row)

  const outgoing = toRows(merged).filter((row) => onServer[row.roundId] !== rowStamp(row))
  if (outgoing.length > 0) await remote.push(outgoing)
  for (const row of outgoing) onServer[row.roundId] = rowStamp(row)

  return {
    state: merged,
    cursors: {
      lastPulledCursor: highest(
        pulled.map((row) => row.cursor),
        cursors.lastPulledCursor,
      ),
      pushed: onServer,
    },
    pulled: pulled.length,
    pushed: outgoing.length,
  }
}
