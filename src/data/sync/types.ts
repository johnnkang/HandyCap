/**
 * The persistence envelope around a round.
 *
 * `updatedAt` and deletions are sync bookkeeping, not World Handicap System
 * properties, so they live here rather than on `Round` — `src/domain/` must
 * stay pure and must not learn that sync exists.
 */
import type { Round } from '@/domain/whs/types'

export interface SyncedRound {
  round: Round
  /** ISO-8601 UTC. When this round was last written, on any device. */
  updatedAt: string
}

/**
 * A remembered deletion. Without these, a round deleted on one device is
 * resurrected by another on the next sync.
 */
export interface Tombstone {
  id: string
  /** ISO-8601 UTC. */
  deletedAt: string
}

export interface SyncState {
  rounds: SyncedRound[]
  tombstones: Tombstone[]
}

export const emptySyncState = (): SyncState => ({ rounds: [], tombstones: [] })
