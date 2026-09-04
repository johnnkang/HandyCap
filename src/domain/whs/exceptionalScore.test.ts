import { describe, expect, test } from 'vitest'
import { exceptionalScoreReduction } from './exceptionalScore'

describe('exceptionalScoreReduction', () => {
  test('an ordinary round triggers nothing', () => {
    expect(exceptionalScoreReduction(12.0, 15.0)).toBe(0)
  })

  test('a round just short of the threshold triggers nothing', () => {
    // 6.9 strokes better than the index
    expect(exceptionalScoreReduction(8.1, 15.0)).toBe(0)
  })

  test('7.0 to 9.9 strokes better than the index reduces by 1.0', () => {
    expect(exceptionalScoreReduction(8.0, 15.0)).toBe(-1.0)
    expect(exceptionalScoreReduction(5.1, 15.0)).toBe(-1.0)
  })

  test('10.0 or more strokes better than the index reduces by 2.0', () => {
    expect(exceptionalScoreReduction(5.0, 15.0)).toBe(-2.0)
    expect(exceptionalScoreReduction(0.0, 15.0)).toBe(-2.0)
  })

  test('a player without an index cannot post an exceptional score', () => {
    expect(exceptionalScoreReduction(2.0, null)).toBe(0)
  })
})
