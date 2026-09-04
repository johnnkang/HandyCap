import { describe, expect, test } from 'vitest'
import { handicapIndex, MAX_HANDICAP_INDEX } from './handicapIndex'
import { strokesReceived } from './strokes'

/** A tiny deterministic generator, so a failure is always reproducible. */
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const differentialSets = (count: number, seed: number) => {
  const random = seeded(seed)
  return Array.from({ length: count }, () => {
    const size = 3 + Math.floor(random() * 30)
    return Array.from({ length: size }, () => Math.round(random() * 700 - 50) / 10)
  })
}

/** Records of at least 20 scores, where the Rule 5.2a table no longer changes. */
const fullRecords = (count: number, seed: number) => {
  const random = seeded(seed)
  return Array.from({ length: count }, () => {
    const size = 20 + Math.floor(random() * 15)
    return Array.from({ length: size }, () => Math.round(random() * 700 - 50) / 10)
  })
}

describe('Rule 5.2a table boundaries', () => {
  // Surprising but correct: the six-score row carries a -1.0 adjustment, so a
  // sixth round can lower the index no matter how badly it was played. The app
  // explains this rather than hiding it.
  test('a sixth round can lower the index even when it is the worst round yet', () => {
    const five = [10.0, 10.0, 10.0, 10.0, 10.0]
    expect(handicapIndex(five)).toBe(10.0)
    expect(handicapIndex([...five, 50.0])).toBe(9.0)
  })

  test('a seventh round removes that adjustment again', () => {
    const six = [10.0, 10.0, 10.0, 10.0, 10.0, 50.0]
    expect(handicapIndex(six)).toBe(9.0)
    expect(handicapIndex([...six, 50.0])).toBe(10.0)
  })
})

describe('handicap index invariants', () => {
  test('never exceeds the maximum handicap index', () => {
    for (const differentials of differentialSets(200, 1)) {
      const index = handicapIndex(differentials)
      expect(index).not.toBeNull()
      expect(index!).toBeLessThanOrEqual(MAX_HANDICAP_INDEX)
    }
  })

  test('never sits more than 5.0 strokes above the low handicap index', () => {
    for (const differentials of differentialSets(200, 2)) {
      const low = 10.0
      const index = handicapIndex(differentials, low)
      expect(index!).toBeLessThanOrEqual(low + 5.0)
    }
  })

  // Monotonicity only holds once the record is full. Below 20 scores the
  // Rule 5.2a table changes shape as scores are added, and those steps can move
  // the index against the round that triggered them -- see the boundary tests
  // below, which pin that behaviour down deliberately.
  test('posting a worse round never lowers the index of a full record', () => {
    for (const differentials of fullRecords(200, 3)) {
      const before = handicapIndex(differentials)
      const worst = Math.max(...differentials)
      const after = handicapIndex([...differentials, worst + 10])
      expect(after!).toBeGreaterThanOrEqual(before!)
    }
  })

  test('posting a better round never raises the index of a full record', () => {
    for (const differentials of fullRecords(200, 4)) {
      const before = handicapIndex(differentials)
      const best = Math.min(...differentials)
      const after = handicapIndex([...differentials, best - 5])
      expect(after!).toBeLessThanOrEqual(before!)
    }
  })

  test('handicap strokes always sum to the course handicap', () => {
    for (let courseHandicap = -10; courseHandicap <= 54; courseHandicap++) {
      let total = 0
      for (let strokeIndex = 1; strokeIndex <= 18; strokeIndex++) {
        total += strokesReceived(courseHandicap, strokeIndex)
      }
      expect(total).toBe(courseHandicap)
    }
  })

  test('a harder hole never gives fewer strokes than an easier one', () => {
    for (let courseHandicap = 0; courseHandicap <= 54; courseHandicap++) {
      for (let strokeIndex = 2; strokeIndex <= 18; strokeIndex++) {
        expect(strokesReceived(courseHandicap, strokeIndex - 1)).toBeGreaterThanOrEqual(
          strokesReceived(courseHandicap, strokeIndex),
        )
      }
    }
  })
})
