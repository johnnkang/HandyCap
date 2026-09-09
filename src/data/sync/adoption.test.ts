import { describe, expect, test } from 'vitest'
import { testRound } from '@/test/fixtures'
import { createMemoryStore } from '@/data/repo/store'
import {
  clearUndoSnapshot,
  saveUndoSnapshot,
  summariseAdoption,
  takeUndoSnapshot,
} from './adoption'
import type { SyncState } from './types'

const stateOf = (...ids: string[]): SyncState => ({
  rounds: ids.map((id) => ({
    round: testRound({ id, date: '2026-05-01', totalStrokes: 90 }),
    updatedAt: '2026-05-01T00:00:00.000Z',
  })),
  tombstones: [],
})

describe('adoption', () => {
  test('counts what the device contributed', () => {
    expect(summariseAdoption(stateOf('a', 'b'), stateOf('a', 'b', 'c', 'd'))).toEqual({
      before: 2,
      added: 2,
      after: 4,
    })
  })

  test('reports nothing added when the account already had everything', () => {
    expect(summariseAdoption(stateOf('a'), stateOf('a'))).toEqual({
      before: 1,
      added: 0,
      after: 1,
    })
  })

  test('a saved snapshot can be taken back exactly once', async () => {
    const store = createMemoryStore()
    await saveUndoSnapshot(store, stateOf('a'))
    expect((await takeUndoSnapshot(store))?.rounds).toHaveLength(1)
    expect(await takeUndoSnapshot(store)).toBeNull()
  })

  test('a cleared snapshot cannot be taken', async () => {
    const store = createMemoryStore()
    await saveUndoSnapshot(store, stateOf('a'))
    await clearUndoSnapshot(store)
    expect(await takeUndoSnapshot(store)).toBeNull()
  })
})
