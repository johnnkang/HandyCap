import type { Round } from '@/domain/whs/types'
import { emptySyncState, type SyncState } from './types'

/**
 * One round as the server holds it.
 *
 * A deletion is a row with `deletedAt` set, never a missing row — see
 * `pull`. Timestamps are the exact ISO-8601 UTC strings the client wrote, so
 * that lexicographic comparison stays valid everywhere.
 */
export interface RemoteRound {
  roundId: string
  /** `null` when the row is a tombstone. */
  payload: Round | null
  updatedAt: string
  deletedAt: string | null
}

export interface RemoteStore {
  /**
   * Rows changed strictly after `since`; every row when `since` is undefined.
   *
   * This returns a DELTA. A round absent from the result is unchanged, never
   * deleted — reading absence as deletion would destroy the user's history.
   */
  pull(since: string | undefined): Promise<RemoteRound[]>
  push(rows: RemoteRound[]): Promise<void>
  /** Remove every row for this account. Used by account deletion. */
  deleteEverything(): Promise<void>
}

/** The timestamp a row is ordered by, whichever kind it is. */
export const rowStamp = (row: RemoteRound): string => row.deletedAt ?? row.updatedAt

export function toSyncState(rows: RemoteRound[]): SyncState {
  const state = emptySyncState()
  for (const row of rows) {
    if (row.deletedAt) state.tombstones.push({ id: row.roundId, deletedAt: row.deletedAt })
    else if (row.payload) state.rounds.push({ round: row.payload, updatedAt: row.updatedAt })
  }
  return state
}

export function toRows(state: SyncState): RemoteRound[] {
  return [
    ...state.rounds.map((entry) => ({
      roundId: entry.round.id,
      payload: entry.round,
      updatedAt: entry.updatedAt,
      deletedAt: null,
    })),
    ...state.tombstones.map((tombstone) => ({
      roundId: tombstone.id,
      payload: null,
      updatedAt: tombstone.deletedAt,
      deletedAt: tombstone.deletedAt,
    })),
  ]
}

/** In-memory `RemoteStore`, so the engine is tested without a network. */
export function createMemoryRemote(seed: RemoteRound[] = []): RemoteStore {
  const rows = new Map<string, RemoteRound>(seed.map((row) => [row.roundId, row]))
  return {
    async pull(since) {
      const all = [...rows.values()]
      const changed = since ? all.filter((row) => rowStamp(row) > since) : all
      return changed
        .map((row) => ({ ...row }))
        .sort((a, b) => rowStamp(a).localeCompare(rowStamp(b)))
    },
    async push(incoming) {
      for (const row of incoming) rows.set(row.roundId, { ...row })
    },
    async deleteEverything() {
      rows.clear()
    },
  }
}
