import type { Round } from '@/domain/whs/types'
import { emptySyncState, type SyncState } from '@/data/sync/types'
import type { KeyValueStore } from './store'

/** Bump when the stored shape changes, and add a migration below. */
export const CURRENT_SCHEMA_VERSION = 2

/** v1 wrote a bare `Round[]` here. Read once by the migration, then removed. */
const LEGACY_ROUNDS_KEY = 'handycap:rounds'
const STATE_KEY = 'handycap:sync'
const VERSION_KEY = 'handycap:schemaVersion'

export interface HandyCapExport {
  schemaVersion: number
  exportedAt: string
  rounds: Round[]
}

export interface Repository {
  loadRounds(): Promise<Round[]>
  saveRound(round: Round): Promise<void>
  deleteRound(id: string): Promise<void>
  exportJson(): Promise<string>
  importJson(json: string): Promise<void>
  /** The record plus its sync bookkeeping. Used by the sync engine. */
  loadState(): Promise<SyncState>
  /** Replace the whole record, as the result of a completed sync. */
  replaceState(state: SyncState): Promise<void>
}

export interface RepositoryOptions {
  /** Injected so tests are deterministic. */
  now?: () => string
}

const byDate = (a: Round, b: Round) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)

export function createRepository(
  store: KeyValueStore,
  { now = () => new Date().toISOString() }: RepositoryOptions = {},
): Repository {
  async function readState(): Promise<SyncState> {
    const stored = await store.get<SyncState>(STATE_KEY)
    if (stored) return stored

    // v1 -> v2. At this moment the device holds the only copy of the data that
    // exists, so "last written now" is the correct reading.
    const legacy = await store.get<Round[]>(LEGACY_ROUNDS_KEY)
    if (!legacy) return emptySyncState()

    const at = now()
    const migrated: SyncState = {
      rounds: legacy.map((round) => ({ round, updatedAt: at })),
      tombstones: [],
    }
    await writeState(migrated)
    // The v1 array is now a second, complete copy of the golfer's rounds that
    // nothing reads and no sign-out wipes. Drop it once the migration has
    // actually landed.
    await store.remove(LEGACY_ROUNDS_KEY)
    return migrated
  }

  async function writeState(state: SyncState): Promise<void> {
    await store.set(STATE_KEY, state)
    await store.set(VERSION_KEY, CURRENT_SCHEMA_VERSION)
  }

  return {
    async loadRounds() {
      return (await readState()).rounds.map((entry) => entry.round).sort(byDate)
    },

    async loadState() {
      return readState()
    },

    async replaceState(state) {
      await writeState(state)
    },

    async saveRound(round) {
      const state = await readState()
      const at = now()
      const rounds = state.rounds.filter((entry) => entry.round.id !== round.id)
      rounds.push({ round, updatedAt: at })
      await writeState({
        rounds,
        // A re-saved round outlives any earlier deletion of the same id.
        tombstones: state.tombstones.filter((tombstone) => tombstone.id !== round.id),
      })
    },

    async deleteRound(id) {
      const state = await readState()
      await writeState({
        rounds: state.rounds.filter((entry) => entry.round.id !== id),
        tombstones: [
          ...state.tombstones.filter((tombstone) => tombstone.id !== id),
          { id, deletedAt: now() },
        ],
      })
    },

    async exportJson() {
      const state = await readState()
      // The export is a human-facing backup and deliberately carries no sync
      // bookkeeping, so it stays readable and importable by any version.
      const payload: HandyCapExport = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        exportedAt: now(),
        rounds: state.rounds.map((entry) => entry.round).sort(byDate),
      }
      return JSON.stringify(payload, null, 2)
    },

    async importJson(json) {
      let payload: unknown
      try {
        payload = JSON.parse(json)
      } catch {
        throw new Error('That file is not valid JSON.')
      }

      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('schemaVersion' in payload) ||
        !('rounds' in payload) ||
        !Array.isArray((payload as HandyCapExport).rounds)
      ) {
        throw new Error('That file is not a HandyCap export.')
      }

      const { schemaVersion, rounds } = payload as HandyCapExport
      if (schemaVersion > CURRENT_SCHEMA_VERSION) {
        throw new Error(
          'That export came from a newer version of HandyCap. Update the app first.',
        )
      }

      const at = now()
      await writeState({
        rounds: rounds.map((round) => ({ round, updatedAt: at })),
        tombstones: [],
      })
    },
  }
}
