/**
 * Convergence properties of the merge.
 *
 * Seeded so a failure is reproducible. The generator deliberately produces
 * colliding ids and timestamps across the three states, because that is where
 * tie-breaking has to hold.
 */
import { describe, expect, test } from 'vitest'
import { testRound } from '@/test/fixtures'
import { mergeStates } from './merge'
import type { SyncState } from './types'

/** Deterministic PRNG (mulberry32), so a failing case can be reproduced. */
function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAYS = ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04']
const STAMPS = [
  '2026-05-01T00:00:00.000Z',
  '2026-05-02T00:00:00.000Z',
  '2026-05-03T00:00:00.000Z',
]

function randomState(rand: () => number): SyncState {
  const state: SyncState = { rounds: [], tombstones: [] }
  const count = Math.floor(rand() * 6)
  for (let i = 0; i < count; i++) {
    const id = `r${Math.floor(rand() * 5)}`
    const at = STAMPS[Math.floor(rand() * STAMPS.length)]!
    if (rand() < 0.3) {
      state.tombstones.push({ id, deletedAt: at })
    } else {
      state.rounds.push({
        round: testRound({
          id,
          date: DAYS[Math.floor(rand() * DAYS.length)]!,
          totalStrokes: 80 + Math.floor(rand() * 20),
        }),
        updatedAt: at,
      })
    }
  }
  return state
}

describe('merge convergence', () => {
  test('is commutative: which device syncs first cannot matter', () => {
    const rand = seeded(1)
    for (let i = 0; i < 400; i++) {
      const a = randomState(rand)
      const b = randomState(rand)
      expect(mergeStates(a, b)).toEqual(mergeStates(b, a))
    }
  })

  test('is idempotent: syncing twice changes nothing', () => {
    const rand = seeded(2)
    for (let i = 0; i < 400; i++) {
      const a = randomState(rand)
      const b = randomState(rand)
      const once = mergeStates(a, b)
      expect(mergeStates(once, b)).toEqual(once)
      expect(mergeStates(once, once)).toEqual(once)
    }
  })

  test('is associative: three devices converge however they pair up', () => {
    const rand = seeded(3)
    for (let i = 0; i < 400; i++) {
      const a = randomState(rand)
      const b = randomState(rand)
      const c = randomState(rand)
      expect(mergeStates(mergeStates(a, b), c)).toEqual(mergeStates(a, mergeStates(b, c)))
    }
  })

  test('agrees with an independently computed winner for every id', () => {
    const rand = seeded(4)
    for (let i = 0; i < 400; i++) {
      const a = randomState(rand)
      const b = randomState(rand)
      const merged = mergeStates(a, b)

      // The expected outcome, derived from the rules rather than from the
      // merge: the newest claim for an id wins, and a deletion takes a tie.
      const newestWrite = new Map<string, string>()
      const newestDelete = new Map<string, string>()
      for (const side of [a, b]) {
        for (const { round, updatedAt } of side.rounds) {
          const held = newestWrite.get(round.id)
          if (!held || updatedAt > held) newestWrite.set(round.id, updatedAt)
        }
        for (const { id, deletedAt } of side.tombstones) {
          const held = newestDelete.get(id)
          if (!held || deletedAt > held) newestDelete.set(id, deletedAt)
        }
      }

      const survived = new Map(merged.rounds.map((r) => [r.round.id, r.updatedAt]))
      const deleted = new Map(merged.tombstones.map((t) => [t.id, t.deletedAt]))

      for (const id of new Set([...newestWrite.keys(), ...newestDelete.keys()])) {
        const write = newestWrite.get(id)
        const remove = newestDelete.get(id)
        const isDeleted = remove !== undefined && (write === undefined || remove >= write)

        expect(deleted.has(id)).toBe(isDeleted)
        expect(survived.has(id)).toBe(!isDeleted)
        if (isDeleted) expect(deleted.get(id)).toBe(remove)
        else expect(survived.get(id)).toBe(write)
      }
    }
  })
})
