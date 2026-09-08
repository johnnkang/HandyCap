import { mergeStates } from './merge'
import { rowStamp, toRows, toSyncState, type OutgoingRound, type RemoteStore } from './remote'
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
   * roundId -> a fingerprint of the version this device last got onto the
   * server. Per round and content-aware, so a round stamped earlier than a
   * previous push still uploads instead of falling under a high-water mark
   * forever, and a merge winner sharing its loser's timestamp is not mistaken
   * for something the server already has. Bounded by the number of rounds,
   * which is tens.
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
 * A fingerprint of what a row actually says, used to decide whether the server
 * already holds this version.
 *
 * The stamp alone is not enough. When two devices write the same round in the
 * same millisecond, `mergeStates` picks a winner by comparing content — but the
 * winner keeps the shared timestamp, so a stamp-only check would conclude the
 * server already had it and never push the winner. The two devices would then
 * disagree forever, which is exactly the divergence the merge exists to prevent.
 *
 * FNV-1a, 32-bit, and deliberately not cryptographic: it only has to tell two
 * versions of one round apart, and a collision merely skips a push that a later
 * edit would send anyway. Hashing rather than storing the content keeps the
 * persisted cursor small.
 */
const fingerprint = (row: OutgoingRound): string => {
  const source = `${rowStamp(row)}|${row.deletedAt ? 'deleted' : JSON.stringify(row.payload)}`
  let hash = 0x811c9dc5
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

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
  // on top of what this device has already put there. Keyed by content, so a
  // merge winner that shares its loser's timestamp is still recognised as new.
  const onServer: Record<string, string> = { ...cursors.pushed }
  for (const row of pulled) onServer[row.roundId] = fingerprint(row)

  const outgoing = toRows(merged).filter((row) => onServer[row.roundId] !== fingerprint(row))
  if (outgoing.length > 0) await remote.push(outgoing)
  for (const row of outgoing) onServer[row.roundId] = fingerprint(row)

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
