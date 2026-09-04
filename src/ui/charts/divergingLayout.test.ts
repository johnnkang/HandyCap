import { describe, expect, test } from 'vitest'
import { divergingLayout } from './divergingLayout'

type Klass = 'under' | 'neutral' | 'over' | 'worse'
const CLASSES: Klass[] = ['under', 'neutral', 'over', 'worse']

const row = (key: string, counts: Partial<Record<Klass, number>>) => {
  const filled = { under: 0, neutral: 0, over: 0, worse: 0, ...counts }
  return {
    key,
    counts: filled,
    total: Object.values(filled).reduce((sum, value) => sum + value, 0),
  }
}

describe('divergingLayout', () => {
  test('centres a row that is entirely neutral', () => {
    const layout = divergingLayout([row('a', { neutral: 10 })], CLASSES, 'neutral')
    expect(layout.centre).toBeCloseTo(50, 5)
    const segment = layout.rows[0]!.segments[0]!
    expect(segment.left).toBeCloseTo(0, 5)
    expect(segment.width).toBeCloseTo(100, 5)
  })

  test('a row with nothing on the left starts exactly at the centre line', () => {
    // One row is all neutral, so it claims a half-width left arm. The other is
    // all "over", so it must begin at the centre rather than at the far left.
    const layout = divergingLayout(
      [row('allNeutral', { neutral: 10 }), row('allOver', { over: 10 })],
      CLASSES,
      'neutral',
    )
    const allOver = layout.rows.find((r) => r.key === 'allOver')!
    expect(allOver.segments[0]!.left).toBeCloseTo(layout.centre, 5)
  })

  test('every row shares one origin, so rows are comparable', () => {
    const layout = divergingLayout(
      [
        row('a', { under: 2, neutral: 4, over: 4 }),
        row('b', { neutral: 2, over: 8 }),
        row('c', { under: 6, neutral: 4 }),
      ],
      CLASSES,
      'neutral',
    )
    // In each row the neutral segment straddles the shared centre line.
    for (const rendered of layout.rows) {
      const neutral = rendered.segments.find((segment) => segment.scoreClass === 'neutral')
      if (!neutral) continue
      expect(neutral.left + neutral.width / 2).toBeCloseTo(layout.centre, 5)
    }
  })

  test('segments follow the declared class order left to right', () => {
    const layout = divergingLayout(
      [row('a', { under: 1, neutral: 1, over: 1, worse: 1 })],
      CLASSES,
      'neutral',
    )
    expect(layout.rows[0]!.segments.map((segment) => segment.scoreClass)).toEqual(CLASSES)
    const lefts = layout.rows[0]!.segments.map((segment) => segment.left)
    expect([...lefts].sort((a, b) => a - b)).toEqual(lefts)
  })

  test('omits classes with no holes rather than emitting zero-width segments', () => {
    const layout = divergingLayout([row('a', { neutral: 5, over: 5 })], CLASSES, 'neutral')
    expect(layout.rows[0]!.segments.map((segment) => segment.scoreClass)).toEqual([
      'neutral',
      'over',
    ])
  })

  test('skips a row with nothing played', () => {
    const layout = divergingLayout([row('empty', {})], CLASSES, 'neutral')
    expect(layout.rows[0]!.segments).toEqual([])
  })

  test('widths are shares of the row, so rows of different length compare', () => {
    const layout = divergingLayout(
      [row('short', { over: 5 }), row('long', { over: 50 })],
      CLASSES,
      'neutral',
    )
    const [short, long] = layout.rows
    expect(short!.segments[0]!.width).toBeCloseTo(long!.segments[0]!.width, 5)
  })
})
