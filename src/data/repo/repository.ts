import type { Round } from '@/domain/whs/types'
import type { KeyValueStore } from './store'

/** Bump when the stored shape changes, and add a migration below. */
export const CURRENT_SCHEMA_VERSION = 1

const ROUNDS_KEY = 'handycap:rounds'
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
}

const byDate = (a: Round, b: Round) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)

export function createRepository(store: KeyValueStore): Repository {
  async function readRounds(): Promise<Round[]> {
    return (await store.get<Round[]>(ROUNDS_KEY)) ?? []
  }

  async function writeRounds(rounds: Round[]): Promise<void> {
    await store.set(ROUNDS_KEY, [...rounds].sort(byDate))
    await store.set(VERSION_KEY, CURRENT_SCHEMA_VERSION)
  }

  return {
    async loadRounds() {
      return [...(await readRounds())].sort(byDate)
    },

    async saveRound(round) {
      const rounds = await readRounds()
      const existing = rounds.findIndex((candidate) => candidate.id === round.id)
      if (existing >= 0) rounds[existing] = round
      else rounds.push(round)
      await writeRounds(rounds)
    },

    async deleteRound(id) {
      await writeRounds((await readRounds()).filter((round) => round.id !== id))
    },

    async exportJson() {
      const payload: HandyCapExport = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        rounds: await readRounds(),
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

      await writeRounds(rounds)
    },
  }
}
