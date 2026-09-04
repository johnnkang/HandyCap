import { useState } from 'react'

export interface TrajectoryPointView {
  label: string
  index: number
  projected: boolean
}

const WIDTH = 320
const HEIGHT = 150
const PADDING = { top: 14, right: 36, bottom: 22, left: 34 }

/**
 * Your Handicap Index over time, with where it is heading.
 *
 * One entity in two states rather than two series: the actual line is solid and
 * the projection continues it dashed, so identity never rests on colour. Lower
 * is better in golf, so a line falling toward the bottom is improvement.
 */
export function TrajectoryChart({ points }: { points: TrajectoryPointView[] }) {
  const [active, setActive] = useState<number | null>(null)

  if (points.length < 2) return null

  const values = points.map((point) => point.index)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, 1)
  const low = min - span * 0.15
  const high = max + span * 0.15

  const plotWidth = WIDTH - PADDING.left - PADDING.right
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom

  const x = (i: number) => PADDING.left + (i / (points.length - 1)) * plotWidth
  const y = (value: number) =>
    PADDING.top + ((high - value) / (high - low)) * plotHeight

  const path = (subset: TrajectoryPointView[], offset: number) =>
    subset
      .map((point, i) => `${i === 0 ? 'M' : 'L'} ${x(i + offset)} ${y(point.index)}`)
      .join(' ')

  const lastActualIndex = points.findLastIndex((point) => !point.projected)
  const actual = points.slice(0, lastActualIndex + 1)
  // The projection starts from the last actual point so the line is continuous.
  const projected = points.slice(Math.max(lastActualIndex, 0))

  const first = points[0]!
  const last = points[points.length - 1]!

  return (
    <figure className="m-0">
      <figcaption className="label mb-2">Your index, and where it is heading</figcaption>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Handicap index from ${first.index.toFixed(1)} to a projected ${last.index.toFixed(1)}`}
      >
        {[low, (low + high) / 2, high].map((value) => (
          <g key={value}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y(value)}
              y2={y(value)}
              stroke="var(--hairline)"
              strokeWidth="1"
            />
            <text
              x={PADDING.left - 6}
              y={y(value) + 3}
              textAnchor="end"
              fontSize="9"
              fill="var(--ink-faint)"
            >
              {value.toFixed(1)}
            </text>
          </g>
        ))}

        {actual.length > 1 && (
          <path
            d={path(actual, 0)}
            fill="none"
            stroke="var(--signal)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {projected.length > 1 && (
          <path
            d={path(projected, Math.max(lastActualIndex, 0))}
            fill="none"
            stroke="var(--signal)"
            strokeWidth="2"
            strokeDasharray="4 4"
            strokeOpacity="0.7"
            strokeLinecap="round"
          />
        )}

        {points.map((point, i) => (
          <g key={i}>
            <circle
              cx={x(i)}
              cy={y(point.index)}
              r={active === i ? 5 : 3}
              fill={point.projected ? 'var(--ground)' : 'var(--signal)'}
              stroke="var(--signal)"
              strokeWidth="2"
            />
            {/* A tap target far larger than the mark, per interaction guidance. */}
            <rect
              x={x(i) - 12}
              y={PADDING.top}
              width="24"
              height={plotHeight}
              fill="transparent"
              onClick={() => setActive(active === i ? null : i)}
              style={{ cursor: 'pointer' }}
            />
          </g>
        ))}

        <text
          x={WIDTH - PADDING.right + 4}
          y={y(last.index) + 3}
          fontSize="10"
          fill="var(--ink)"
          className="numeral"
        >
          {last.index.toFixed(1)}
        </text>
      </svg>

      <div className="mt-1 flex items-center justify-between">
        <ul className="flex gap-4">
          <li className="flex items-center gap-1.5">
            <svg width="16" height="4" aria-hidden="true">
              <line x1="0" y1="2" x2="16" y2="2" stroke="var(--signal)" strokeWidth="2" />
            </svg>
            <span className="label">Actual</span>
          </li>
          <li className="flex items-center gap-1.5">
            <svg width="16" height="4" aria-hidden="true">
              <line
                x1="0"
                y1="2"
                x2="16"
                y2="2"
                stroke="var(--signal)"
                strokeWidth="2"
                strokeDasharray="4 4"
                strokeOpacity="0.7"
              />
            </svg>
            <span className="label">Projected</span>
          </li>
        </ul>
        {active !== null && (
          <p className="label" style={{ color: 'var(--ink)' }}>
            {points[active]!.label} · {points[active]!.index.toFixed(1)}
          </p>
        )}
      </div>
    </figure>
  )
}
