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
  /**
   * Server-assigned, monotonically increasing in commit order.
   *
   * This is the ONLY value the pull cursor may advance on. `updatedAt` comes
   * from the writing device's clock, so a device running fast would push its
   * cursor past rows other devices had not yet written and never see them
   * again. Ordering for transfer is the server's job; ordering for conflict
   * resolution is what `updatedAt` is for. Keeping them separate is what makes
   * a wrong device clock merely unfair rather than data-hiding.
   */
  cursor: string
}

/** A row as a client offers it: the server assigns the cursor. */
export type OutgoingRound = Omit<RemoteRound, 'cursor'>

export interface RemoteStore {
  /**
   * Rows with a cursor strictly after `since`; every row when `since` is
   * undefined.
   *
   * This returns a DELTA. A round absent from the result is unchanged, never
   * deleted — reading absence as deletion would destroy the user's history.
   */
  pull(since: string | undefined): Promise<RemoteRound[]>
  push(rows: OutgoingRound[]): Promise<void>
  /** Remove every row for this account. Used by account deletion. */
  deleteEverything(): Promise<void>
}

/**
 * The timestamp a row is ordered by, whichever kind it is.
 *
 * Takes only the two fields it reads, so it accepts an `OutgoingRound` — which
 * has no cursor yet — as readily as a stored `RemoteRound`.
 */
export const rowStamp = (row: Pick<RemoteRound, 'updatedAt' | 'deletedAt'>): string =>
  row.deletedAt ?? row.updatedAt

export function toSyncState(rows: RemoteRound[]): SyncState {
  const state = emptySyncState()
  for (const row of rows) {
    if (row.deletedAt) state.tombstones.push({ id: row.roundId, deletedAt: row.deletedAt })
    else if (row.payload) state.rounds.push({ round: row.payload, updatedAt: row.updatedAt })
  }
  return state
}

export function toRows(state: SyncState): OutgoingRound[] {
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
export function createMemoryRemote(seed: OutgoingRound[] = []): RemoteStore {
  const rows = new Map<string, RemoteRound>()
  let sequence = 0

  const write = (row: OutgoingRound) => {
    // Zero-padded so cursors compare lexicographically, matching how the real
    // server hands them out.
    sequence += 1
    rows.set(row.roundId, { ...row, cursor: String(sequence).padStart(12, '0') })
  }
  for (const row of seed) write(row)

  return {
    async pull(since) {
      return [...rows.values()]
        .filter((row) => !since || row.cursor > since)
        .sort((a, b) => a.cursor.localeCompare(b.cursor))
        .map((row) => ({ ...row }))
    },
    async push(incoming) {
      for (const row of incoming) write(row)
    },
    async deleteEverything() {
      // The sequence deliberately keeps climbing: reusing a cursor would hide
      // new rows from a device that had already seen the old one.
      rows.clear()
    },
  }
}
