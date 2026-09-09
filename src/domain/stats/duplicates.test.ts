import { describe, expect, test } from 'vitest'
import { testCourse, testRound } from '@/test/fixtures'
import { findProbableDuplicates } from './duplicates'

describe('findProbableDuplicates', () => {
  test('flags the same course, date and score under different ids', () => {
    const rounds = [
      testRound({ id: 'phone', date: '2026-05-01', totalStrokes: 88 }),
      testRound({ id: 'tablet', date: '2026-05-01', totalStrokes: 88 }),
    ]
    const pairs = findProbableDuplicates(rounds)
    expect(pairs).toHaveLength(1)
    expect([pairs[0]!.kept.id, pairs[0]!.other.id].sort()).toEqual(['phone', 'tablet'])
  })

  test('does not flag two different scores on the same day', () => {
    expect(
      findProbableDuplicates([
        testRound({ id: 'a', date: '2026-05-01', totalStrokes: 88 }),
        testRound({ id: 'b', date: '2026-05-01', totalStrokes: 92 }),
      ]),
    ).toEqual([])
  })

  test('does not flag the same score at a different course', () => {
    expect(
      findProbableDuplicates([
        testRound({ id: 'a', date: '2026-05-01', totalStrokes: 88 }),
        testRound({
          id: 'b',
          date: '2026-05-01',
          totalStrokes: 88,
          course: testCourse({ id: 'course-2', name: 'Other Links' }),
        }),
      ]),
    ).toEqual([])
  })

  test('does not flag a genuine 36-hole day at different tees', () => {
    expect(
      findProbableDuplicates([
        testRound({ id: 'a', date: '2026-05-01', totalStrokes: 88 }),
        testRound({
          id: 'b',
          date: '2026-05-01',
          totalStrokes: 88,
          course: testCourse({ tee: { ...testCourse().tee, key: 'blue-male', name: 'Blue' } }),
        }),
      ]),
    ).toEqual([])
  })

  test('finds nothing in a clean record', () => {
    expect(
      findProbableDuplicates([
        testRound({ id: 'a', date: '2026-05-01', totalStrokes: 88 }),
        testRound({ id: 'b', date: '2026-05-08', totalStrokes: 88 }),
      ]),
    ).toEqual([])
  })
})
