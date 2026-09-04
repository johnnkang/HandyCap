import { useState } from 'react'
import {
  SCORE_CLASSES,
  scoreClassColor,
  scoreClassLabel,
  toCounts,
  type ScoreClass,
} from './scoringScale'
import { divergingLayout } from './divergingLayout'
import type { ParTypeStats } from '@/domain/stats/parTypeStats'

/**
 * A diverging stacked bar per par type, centred on par.
 *
 * Under-par scoring runs left of the centre line and over-par runs right, so a
 * reader sees at a glance which par types cost them strokes. Geometry lives in
 * `divergingLayout`, which is tested separately.
 */
export function ScoreDistribution({ byPar }: { byPar: ParTypeStats[] }) {
  const [active, setActive] = useState<{ row: string; scoreClass: ScoreClass } | null>(null)

  const rows = byPar.map((parType) => ({
    key: `Par ${parType.par}`,
    counts: toCounts(parType.distribution),
    total: parType.holesPlayed,
  }))

  if (rows.length === 0) return null

  const layout = divergingLayout(rows, SCORE_CLASSES, 'par')
  const rowByKey = new Map(rows.map((row) => [row.key, row]))

  return (
    <figure className="m-0">
      <figcaption className="label mb-3">
        How you score on each par type · share of holes played
      </figcaption>

      <div className="relative">
        {/* The par line. Everything right of it cost strokes. */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-px"
          style={{ left: `${layout.centre}%`, background: 'var(--hairline-strong)' }}
        />

        <div className="space-y-3">
          {layout.rows.map((row) => (
            <div key={row.key} className="flex items-center gap-3">
              <span className="label w-12 shrink-0">{row.key}</span>
              <div className="relative h-7 flex-1">
                {row.segments.map((segment) => {
                  const isActive =
                    active?.row === row.key && active.scoreClass === segment.scoreClass
                  return (
                    <button
                      key={segment.scoreClass}
                      type="button"
                      onClick={() =>
                        setActive(
                          isActive ? null : { row: row.key, scoreClass: segment.scoreClass },
                        )
                      }
                      className="absolute inset-y-0 grid place-items-center"
                      style={{
                        left: `${segment.left}%`,
                        // A 2px surface gap keeps adjacent fills from merging.
                        width: `calc(${segment.width}% - 2px)`,
                        background: scoreClassColor[segment.scoreClass],
                        borderRadius: '3px',
                        outline: isActive ? '2px solid var(--ink)' : 'none',
                        outlineOffset: '1px',
                      }}
                      aria-label={`${row.key}: ${segment.count} ${scoreClassLabel[segment.scoreClass]}`}
                    >
                      {/* Counts sit on any segment wide enough to hold them. This
                          is also the relief the light-mode amber's contrast needs. */}
                      {segment.width > 12 && (
                        <span className="numeral text-[11px]" style={{ color: '#0a0f0c' }}>
                          {segment.count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {active && (
        <p className="prose-note mt-3">
          {active.row}:{' '}
          <strong style={{ color: 'var(--ink)' }}>
            {rowByKey.get(active.row)!.counts[active.scoreClass]}
          </strong>{' '}
          {scoreClassLabel[active.scoreClass].toLowerCase()} out of{' '}
          {rowByKey.get(active.row)!.total} holes.
        </p>
      )}

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {SCORE_CLASSES.map((scoreClass) => {
          const total = rows.reduce((sum, row) => sum + row.counts[scoreClass], 0)
          return (
            <li key={scoreClass} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: scoreClassColor[scoreClass] }}
              />
              <span className="label" style={{ color: 'var(--ink-dim)' }}>
                {scoreClassLabel[scoreClass]}
              </span>
              <span className="numeral text-xs" style={{ color: 'var(--ink-faint)' }}>
                {total}
              </span>
            </li>
          )
        })}
      </ul>
    </figure>
  )
}
