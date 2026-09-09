/**
 * The guest-to-account moment.
 *
 * Signing in on a device that already holds rounds merges them into the
 * account. That is the right behaviour, but it is also the one moment a user
 * could feel the app moved their data without asking — so it is summarised and
 * kept undoable.
 */
import type { KeyValueStore } from '@/data/repo/store'
import type { SyncState } from './types'

const UNDO_KEY = 'handycap:adoptionUndo'

export interface AdoptionSummary {
  /** Rounds on this device before signing in. */
  before: number
  /** Rounds the account brought that this device did not have. */
  added: number
  after: number
}

export function summariseAdoption(before: SyncState, after: SyncState): AdoptionSummary {
  const had = new Set(before.rounds.map((entry) => entry.round.id))
  return {
    before: before.rounds.length,
    added: after.rounds.filter((entry) => !had.has(entry.round.id)).length,
    after: after.rounds.length,
  }
}

export const saveUndoSnapshot = (store: KeyValueStore, state: SyncState): Promise<void> =>
  store.set(UNDO_KEY, state)

/** Reads and consumes the snapshot, so an undo cannot be applied twice. */
export async function takeUndoSnapshot(store: KeyValueStore): Promise<SyncState | null> {
  const held = await store.get<SyncState>(UNDO_KEY)
  if (!held) return null
  await store.remove(UNDO_KEY)
  return held
}

export const clearUndoSnapshot = (store: KeyValueStore): Promise<void> => store.remove(UNDO_KEY)
