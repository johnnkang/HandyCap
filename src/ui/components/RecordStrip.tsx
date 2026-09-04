import { SCORING_RECORD_SIZE } from '@/domain/whs/handicapIndex'
import type { ScoringRecord } from '@/domain/whs/scoringRecord'

/**
 * The scoring record as twenty bars: one per slot, tallest for the worst
 * differential, and lit for the ones currently counting toward the Index.
 *
 * This is the "best 8 of your last 20" rule made visible. A player can see at a
 * glance which rounds are carrying them and how much of the record is still empty.
 */
export function RecordStrip({ record }: { record: ScoringRecord }) {
  const window = record.differentials.slice(-SCORING_RECORD_SIZE)
  const counting = new Set(record.countingRoundIds)

  const values = window.map((differential) => differential.value)
  const highest = values.length > 0 ? Math.max(...values) : 1
  const lowest = values.length > 0 ? Math.min(...values) : 0
  const span = Math.max(highest - lowest, 1)

  const slots = Array.from({ length: SCORING_RECORD_SIZE }, (_, position) => {
    const offset = SCORING_RECORD_SIZE - window.length
    return position < offset ? null : (window[position - offset] ?? null)
  })

  return (
    <div>
      <div className="record-strip" role="img" aria-label={ariaLabel(window.length, counting.size)}>
        {slots.map((differential, position) => {
          if (!differential) {
            return <div key={position} className="record-bar" data-empty="true" />
          }
          // A lower differential is a better round, so better rounds sit lower
          // and shorter: the strip reads like a scoreboard, not a bar chart.
          const height = 12 + ((differential.value - lowest) / span) * 34
          return (
            <div
              key={differential.roundId}
              className="record-bar"
              data-counting={counting.has(differential.roundId)}
              style={{ height: `${height}px` }}
              title={`${differential.date} · ${differential.value.toFixed(1)}`}
            />
          )
        })}
      </div>
      <div className="mt-2 flex justify-between">
        <span className="label">
          {window.length} of {SCORING_RECORD_SIZE} scores
        </span>
        <span className="label" style={{ color: 'var(--signal)' }}>
          {counting.size} counting
        </span>
      </div>
    </div>
  )
}

function ariaLabel(scores: number, counting: number): string {
  if (scores === 0) return 'No scores posted yet'
  return `${scores} scores in your record, of which the lowest ${counting} count toward your Handicap Index`
}
