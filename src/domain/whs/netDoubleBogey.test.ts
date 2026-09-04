import { describe, expect, test } from 'vitest'
import { maxHoleScore, adjustedGrossScore } from './netDoubleBogey'
import type { HoleInfo, HoleScore } from './types'

const holes: HoleInfo[] = [
  { number: 1, par: 4, strokeIndex: 6 },
  { number: 2, par: 5, strokeIndex: 10 },
  { number: 3, par: 3, strokeIndex: 18 },
]

const score = (number: number, strokes: number | null): HoleScore => ({
  number,
  strokes,
  putts: null,
  fairwayHit: null,
  greenInRegulation: null,
})

describe('maxHoleScore', () => {
  test('a scratch player caps at double bogey', () => {
    expect(maxHoleScore(4, 18, 0)).toBe(6)
    expect(maxHoleScore(3, 1, 0)).toBe(5)
  })

  test('a stroke received raises the cap by one', () => {
    // Course handicap 10 gets a stroke on stroke index 1-10.
    expect(maxHoleScore(4, 6, 10)).toBe(7)
    expect(maxHoleScore(4, 11, 10)).toBe(6)
  })

  test('two strokes received raise the cap by two', () => {
    expect(maxHoleScore(5, 1, 20)).toBe(9)
  })

  test('a plus handicap lowers the cap on holes where strokes are given back', () => {
    expect(maxHoleScore(4, 18, -1)).toBe(5)
    expect(maxHoleScore(4, 1, -1)).toBe(6)
  })

  test('a player with no handicap index yet caps at par plus five', () => {
    expect(maxHoleScore(4, 1, null)).toBe(9)
    expect(maxHoleScore(3, 18, null)).toBe(8)
  })
})

describe('adjustedGrossScore', () => {
  test('leaves a clean round untouched', () => {
    const scores = [score(1, 4), score(2, 5), score(3, 3)]
    expect(adjustedGrossScore(scores, holes, 0)).toBe(12)
  })

  test('caps a blow-up hole at net double bogey', () => {
    // Scratch player: hole 1 par 4 caps at 6, so a 9 counts as 6.
    const scores = [score(1, 9), score(2, 5), score(3, 3)]
    expect(adjustedGrossScore(scores, holes, 0)).toBe(14)
  })

  test('caps each hole independently', () => {
    const scores = [score(1, 9), score(2, 11), score(3, 8)]
    // caps: 6 + 7 + 5 = 18
    expect(adjustedGrossScore(scores, holes, 0)).toBe(18)
  })

  test('a hole not played counts as net par', () => {
    // Rule 3.2: a hole not played is recorded as par plus strokes received.
    const scores = [score(1, 4), score(2, 5), score(3, null)]
    expect(adjustedGrossScore(scores, holes, 0)).toBe(12)
  })

  test('a hole not played by a stroke-receiving player counts as net par', () => {
    // Course handicap 18: a stroke on every hole, so hole 3 counts as 3 + 1.
    const scores = [score(1, 4), score(2, 5), score(3, null)]
    expect(adjustedGrossScore(scores, holes, 18)).toBe(13)
  })
})
