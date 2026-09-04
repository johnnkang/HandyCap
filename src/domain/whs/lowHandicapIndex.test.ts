import { describe, expect, test } from 'vitest'
import { lowHandicapIndex } from './lowHandicapIndex'

describe('lowHandicapIndex', () => {
  test('is null with no history', () => {
    expect(lowHandicapIndex([], '2026-09-04')).toBeNull()
  })

  test('is the lowest index recorded in the trailing year', () => {
    const history = [
      { date: '2026-03-01', index: 14.2 },
      { date: '2026-05-01', index: 11.8 },
      { date: '2026-08-01', index: 13.1 },
    ]
    expect(lowHandicapIndex(history, '2026-09-04')).toBe(11.8)
  })

  test('ignores entries older than 365 days', () => {
    const history = [
      { date: '2024-01-01', index: 4.0 },
      { date: '2026-05-01', index: 11.8 },
    ]
    expect(lowHandicapIndex(history, '2026-09-04')).toBe(11.8)
  })

  test('includes an entry exactly 365 days old', () => {
    const history = [{ date: '2025-09-04', index: 8.3 }]
    expect(lowHandicapIndex(history, '2026-09-04')).toBe(8.3)
  })

  test('ignores entries in the future', () => {
    const history = [
      { date: '2026-05-01', index: 11.8 },
      { date: '2026-12-01', index: 2.0 },
    ]
    expect(lowHandicapIndex(history, '2026-09-04')).toBe(11.8)
  })
})
