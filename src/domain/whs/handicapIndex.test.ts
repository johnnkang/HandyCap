import { describe, expect, test } from 'vitest'
import { handicapIndex, differentialsUsed } from './handicapIndex'

/** n differentials, all the same value, in chronological order. */
const flat = (n: number, value: number) => Array.from({ length: n }, () => value)

describe('handicapIndex', () => {
  test('there is no index below three scores', () => {
    expect(handicapIndex([])).toBeNull()
    expect(handicapIndex([12.0])).toBeNull()
    expect(handicapIndex([12.0, 14.0])).toBeNull()
  })

  describe('Rule 5.2a table for fewer than twenty scores', () => {
    test('three scores use the lowest one minus 2.0', () => {
      expect(handicapIndex([20.0, 25.0, 30.0])).toBe(18.0)
    })

    test('four scores use the lowest one minus 1.0', () => {
      expect(handicapIndex([20.0, 25.0, 30.0, 35.0])).toBe(19.0)
    })

    test('five scores use the lowest one with no adjustment', () => {
      expect(handicapIndex([20.0, 25.0, 30.0, 35.0, 40.0])).toBe(20.0)
    })

    test('six scores use the lowest two minus 1.0', () => {
      // lowest two are 20.0 and 22.0 -> 21.0, minus 1.0
      expect(handicapIndex([20.0, 22.0, 30.0, 35.0, 40.0, 45.0])).toBe(20.0)
    })

    test('seven and eight scores use the lowest two with no adjustment', () => {
      expect(handicapIndex([20.0, 22.0, 30.0, 35.0, 40.0, 45.0, 50.0])).toBe(21.0)
      expect(handicapIndex([20.0, 22.0, 30.0, 35.0, 40.0, 45.0, 50.0, 55.0])).toBe(21.0)
    })

    test('the count of differentials used follows the published table', () => {
      const expected: Record<number, number> = {
        3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 8: 2,
        9: 3, 10: 3, 11: 3, 12: 4, 13: 4, 14: 4,
        15: 5, 16: 5, 17: 6, 18: 6, 19: 7, 20: 8,
      }
      for (const [count, used] of Object.entries(expected)) {
        expect(differentialsUsed(Number(count)).count).toBe(used)
      }
    })

    test('only three, four and six score records carry an adjustment', () => {
      expect(differentialsUsed(3).adjustment).toBe(-2.0)
      expect(differentialsUsed(4).adjustment).toBe(-1.0)
      expect(differentialsUsed(6).adjustment).toBe(-1.0)
      for (const n of [5, 7, 8, 12, 19, 20]) {
        expect(differentialsUsed(n).adjustment).toBe(0)
      }
    })
  })

  test('twenty scores average the lowest eight', () => {
    const differentials = [
      10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0, 17.0,
      30.0, 30.0, 30.0, 30.0, 30.0, 30.0, 30.0, 30.0, 30.0, 30.0, 30.0, 30.0,
    ]
    // (10+11+12+13+14+15+16+17) / 8 = 13.5
    expect(handicapIndex(differentials)).toBe(13.5)
  })

  test('only the most recent twenty scores count', () => {
    // Twenty terrible recent rounds must bury five brilliant old ones.
    const differentials = [...flat(5, 2.0), ...flat(20, 30.0)]
    expect(handicapIndex(differentials)).toBe(30.0)
  })

  test('rounds to the nearest tenth', () => {
    // lowest two of seven are 10.0 and 10.1 -> 10.05
    expect(handicapIndex([10.0, 10.1, 40.0, 40.0, 40.0, 40.0, 40.0])).toBe(10.1)
  })

  test('never exceeds the maximum handicap index of 54.0', () => {
    expect(handicapIndex(flat(20, 60.0))).toBe(54.0)
  })

  describe('caps against the low handicap index', () => {
    test('no cap applies within 3.0 strokes of the low index', () => {
      expect(handicapIndex(flat(20, 12.5), 10.0)).toBe(12.5)
    })

    test('the soft cap halves the increase beyond 3.0 strokes', () => {
      // raw 15.0 against a low index of 10.0: 10.0 + 3.0 + (2.0 / 2) = 14.0
      expect(handicapIndex(flat(20, 15.0), 10.0)).toBe(14.0)
    })

    test('the hard cap holds the index to 5.0 strokes above the low index', () => {
      // raw 20.0 would soft-cap to 16.5, which the hard cap pulls back to 15.0
      expect(handicapIndex(flat(20, 20.0), 10.0)).toBe(15.0)
    })

    test('caps never restrict a downward move', () => {
      expect(handicapIndex(flat(20, 6.0), 10.0)).toBe(6.0)
    })
  })

  test('handles plus handicaps', () => {
    expect(handicapIndex(flat(20, -1.4))).toBe(-1.4)
  })
})
