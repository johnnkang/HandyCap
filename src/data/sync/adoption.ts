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
  /** Rounds this device already held before signing in. */
  onDevice: number
  /** Rounds the account brought down that this device did not have. */
  fromAccount: number
  total: number
}

/**
 * Named for what each number means to the person reading the card, because the
 * obvious names invite exactly the wrong reading: the count of rounds that
 * arrived is a property of the *account*, not of the device.
 */
export function summariseAdoption(before: SyncState, after: SyncState): AdoptionSummary {
  const had = new Set(before.rounds.map((entry) => entry.round.id))
  return {
    onDevice: before.rounds.length,
    fromAccount: after.rounds.filter((entry) => !had.has(entry.round.id)).length,
    total: after.rounds.length,
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
