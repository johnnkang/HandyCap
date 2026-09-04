import { describe, expect, test } from 'vitest'
import { strokesReceived } from './strokes'

describe('strokesReceived', () => {
  test('a scratch player receives no strokes on any hole', () => {
    expect(strokesReceived(0, 1)).toBe(0)
    expect(strokesReceived(0, 18)).toBe(0)
  })

  test('a 9 handicap receives a stroke on the nine hardest holes only', () => {
    expect(strokesReceived(9, 1)).toBe(1)
    expect(strokesReceived(9, 9)).toBe(1)
    expect(strokesReceived(9, 10)).toBe(0)
    expect(strokesReceived(9, 18)).toBe(0)
  })

  test('an 18 handicap receives exactly one stroke on every hole', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesReceived(18, si)).toBe(1)
    }
  })

  test('a 20 handicap receives two strokes on the two hardest holes', () => {
    expect(strokesReceived(20, 1)).toBe(2)
    expect(strokesReceived(20, 2)).toBe(2)
    expect(strokesReceived(20, 3)).toBe(1)
    expect(strokesReceived(20, 18)).toBe(1)
  })

  test('a 54 handicap receives three strokes on every hole', () => {
    expect(strokesReceived(54, 1)).toBe(3)
    expect(strokesReceived(54, 18)).toBe(3)
  })

  test('a plus handicap gives strokes back starting at the easiest hole', () => {
    // A +2 player gives a stroke back on stroke index 18 and 17.
    expect(strokesReceived(-2, 18)).toBe(-1)
    expect(strokesReceived(-2, 17)).toBe(-1)
    expect(strokesReceived(-2, 16)).toBe(0)
    expect(strokesReceived(-2, 1)).toBe(0)
  })

  test('strokes across all 18 holes sum to the course handicap', () => {
    for (const courseHandicap of [-3, 0, 7, 18, 25, 36, 54]) {
      let total = 0
      for (let si = 1; si <= 18; si++) total += strokesReceived(courseHandicap, si)
      expect(total).toBe(courseHandicap)
    }
  })
})
