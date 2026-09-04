export interface DivergingRowInput<K extends string> {
  key: string
  counts: Record<K, number>
  total: number
}

export interface DivergingSegment<K extends string> {
  scoreClass: K
  /** Percentage of the full chart width where this segment starts. */
  left: number
  /** Percentage of the full chart width this segment spans. */
  width: number
  count: number
}

export interface DivergingLayout<K extends string> {
  rows: { key: string; segments: DivergingSegment<K>[] }[]
  /** Percentage position of the neutral centre line, shared by every row. */
  centre: number
}

/**
 * Geometry for a diverging stacked bar centred on a neutral class.
 *
 * Classes before the neutral run left of the centre line and those after it run
 * right, with the neutral class straddling it. Every row is positioned against
 * one shared origin — the widest left arm decides where the centre sits — which
 * is what lets a reader compare rows by how far each spills right without doing
 * any arithmetic.
 *
 * Widths are shares of each row's own total, so rows covering different numbers
 * of holes stay comparable.
 */
export function divergingLayout<K extends string>(
  rows: DivergingRowInput<K>[],
  classes: K[],
  neutral: K,
): DivergingLayout<K> {
  const share = (row: DivergingRowInput<K>, scoreClass: K) =>
    row.total === 0 ? 0 : (row.counts[scoreClass] / row.total) * 100

  const neutralPosition = classes.indexOf(neutral)
  const before = classes.slice(0, neutralPosition)
  const after = classes.slice(neutralPosition + 1)

  const leftArm = (row: DivergingRowInput<K>) =>
    before.reduce((total, scoreClass) => total + share(row, scoreClass), 0) +
    share(row, neutral) / 2

  const rightArm = (row: DivergingRowInput<K>) =>
    share(row, neutral) / 2 +
    after.reduce((total, scoreClass) => total + share(row, scoreClass), 0)

  const populated = rows.filter((row) => row.total > 0)
  const maxLeft = populated.length > 0 ? Math.max(...populated.map(leftArm)) : 50
  const maxRight = populated.length > 0 ? Math.max(...populated.map(rightArm)) : 50
  const fullWidth = maxLeft + maxRight || 100

  const toPercent = (value: number) => (value / fullWidth) * 100

  return {
    centre: toPercent(maxLeft),
    rows: rows.map((row) => {
      if (row.total === 0) return { key: row.key, segments: [] }

      let cursor = maxLeft - leftArm(row)
      const segments: DivergingSegment<K>[] = []
      for (const scoreClass of classes) {
        const width = share(row, scoreClass)
        if (width > 0) {
          segments.push({
            scoreClass,
            left: toPercent(cursor),
            width: toPercent(width),
            count: row.counts[scoreClass],
          })
        }
        cursor += width
      }
      return { key: row.key, segments }
    }),
  }
}
