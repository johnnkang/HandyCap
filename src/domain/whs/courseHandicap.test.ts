import { describe, expect, test } from 'vitest'
import { courseHandicap, playingHandicap } from './courseHandicap'

describe('courseHandicap', () => {
  test('on a neutral course of par equal to its rating, it equals the index', () => {
    expect(courseHandicap(10.0, { slope: 113, courseRating: 72.0, par: 72 })).toBe(10)
  })

  test('a harder course raises the strokes you get', () => {
    // Pebble Beach blue tees: 10.0 * (144/113) + (74.9 - 72) = 12.74 + 2.9 = 15.6 -> 16
    expect(courseHandicap(10.0, { slope: 144, courseRating: 74.9, par: 72 })).toBe(16)
  })

  test('an easier course lowers the strokes you get', () => {
    // 10.0 * (124/113) + (67.3 - 72) = 10.97 - 4.7 = 6.27 -> 6
    expect(courseHandicap(10.0, { slope: 124, courseRating: 67.3, par: 72 })).toBe(6)
  })

  test('a scratch player still gets strokes when the rating exceeds par', () => {
    expect(courseHandicap(0, { slope: 144, courseRating: 74.9, par: 72 })).toBe(3)
  })

  test('a plus handicap stays a plus handicap on a neutral course', () => {
    expect(courseHandicap(-2.0, { slope: 113, courseRating: 72.0, par: 72 })).toBe(-2)
  })

  test('rounds half away from zero', () => {
    // 10.0 * (113/113) + (72.5 - 72) = 10.5 -> 11
    expect(courseHandicap(10.0, { slope: 113, courseRating: 72.5, par: 72 })).toBe(11)
  })
})

describe('playingHandicap', () => {
  test('defaults to the full course handicap', () => {
    expect(playingHandicap(16)).toBe(16)
  })

  test('applies a handicap allowance', () => {
    expect(playingHandicap(16, 0.95)).toBe(15)
    expect(playingHandicap(20, 0.85)).toBe(17)
  })
})
