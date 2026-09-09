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
  test('separates what the device held from what the account brought', () => {
    expect(summariseAdoption(stateOf('a', 'b'), stateOf('a', 'b', 'c', 'd'))).toEqual({
      onDevice: 2,
      fromAccount: 2,
      total: 4,
    })
  })

  test('reports nothing arriving when the account had nothing new', () => {
    expect(summariseAdoption(stateOf('a'), stateOf('a'))).toEqual({
      onDevice: 1,
      fromAccount: 0,
      total: 1,
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
