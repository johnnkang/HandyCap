import { describe, expect, test } from 'vitest'
import { scoreDifferential } from './differential'

describe('scoreDifferential', () => {
  test('applies the WHS formula and rounds to one decimal', () => {
    // (113 / 113) * (85 - 72.0 - 0) = 13.0
    expect(scoreDifferential({ adjustedGrossScore: 85, courseRating: 72.0, slope: 113 })).toBe(13.0)
  })

  test('a harder slope produces a lower differential for the same score', () => {
    const easy = scoreDifferential({ adjustedGrossScore: 90, courseRating: 70.0, slope: 113 })
    const hard = scoreDifferential({ adjustedGrossScore: 90, courseRating: 70.0, slope: 145 })
    expect(hard).toBeLessThan(easy)
  })

  test('worked example: 95 at course rating 71.4, slope 128', () => {
    // (113 / 128) * (95 - 71.4) = 0.8828125 * 23.6 = 20.834... -> 20.8
    expect(scoreDifferential({ adjustedGrossScore: 95, courseRating: 71.4, slope: 128 })).toBe(20.8)
  })

  test('shooting better than the course rating produces a negative differential', () => {
    expect(scoreDifferential({ adjustedGrossScore: 68, courseRating: 74.9, slope: 144 })).toBeLessThan(0)
  })

  test('subtracts the playing conditions calculation when one is supplied', () => {
    const neutral = scoreDifferential({ adjustedGrossScore: 85, courseRating: 72.0, slope: 113 })
    const tough = scoreDifferential({ adjustedGrossScore: 85, courseRating: 72.0, slope: 113, pcc: 1 })
    expect(tough).toBe(Number((neutral - 1).toFixed(1)))
  })
})
