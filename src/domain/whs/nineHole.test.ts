import { describe, expect, test } from 'vitest'
import { deriveNineHoleRating, nineHoleDifferential, combineNines } from './nineHole'

describe('deriveNineHoleRating', () => {
  test('halves an eighteen hole course rating', () => {
    expect(deriveNineHoleRating(72.0)).toBe(36.0)
    expect(deriveNineHoleRating(74.9)).toBe(37.45)
  })
})

describe('nineHoleDifferential', () => {
  test('uses the nine hole rating and the full slope', () => {
    // (113 / 113) * (45 - 36.0) = 9.0
    expect(nineHoleDifferential({ adjustedGrossScore: 45, courseRating: 36.0, slope: 113 })).toBe(9.0)
  })

  test('a harder slope lowers the differential', () => {
    const easy = nineHoleDifferential({ adjustedGrossScore: 48, courseRating: 36.0, slope: 113 })
    const hard = nineHoleDifferential({ adjustedGrossScore: 48, courseRating: 36.0, slope: 140 })
    expect(hard).toBeLessThan(easy)
  })
})

describe('combineNines', () => {
  test('adds two nine hole differentials into one eighteen hole differential', () => {
    expect(combineNines(9.0, 8.5)).toBe(17.5)
  })

  test('rounds the combined value to one decimal', () => {
    expect(combineNines(9.05, 8.04)).toBe(17.1)
  })
})
