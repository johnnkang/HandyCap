import { useState } from 'react'
import {
  SCORE_CLASSES,
  scoreClassColor,
  scoreClassLabel,
  toCounts,
  type ScoreClass,
} from './scoringScale'
import type { ParTypeStats } from '@/domain/stats/parTypeStats'

interface Row {
  label: string
  counts: Record<ScoreClass, number>
  total: number
}

/**
 * A diverging stacked bar per par type, centred on par.
 *
 * Under-par scoring runs left of the centre line and over-par runs right, with
 * par itself straddling it. Rows share one origin, so the reader compares par
 * types by how far each spills to the right without doing any arithmetic.
 */
export function ScoreDistribution({ byPar }: { byPar: ParTypeStats[] }) {
  const [active, setActive] = useState<{ row: string; scoreClass: ScoreClass } | null>(null)

  const rows: Row[] = byPar.map((parType) => {
    const counts = toCounts(parType.distribution)
    return {
      label: `Par ${parType.par}`,
      counts,
      total: parType.holesPlayed,
    }
  })

  if (rows.length === 0) return null

  const share = (row: Row, scoreClass: ScoreClass) =>
    row.total === 0 ? 0 : (row.counts[scoreClass] / row.total) * 100

  // One shared origin across rows: the widest left arm sets where centre sits.
  const leftArm = (row: Row) => share(row, 'birdieOrBetter') + share(row, 'par') / 2
  const rightArm = (row: Row) =>
    share(row, 'par') / 2 +
    share(row, 'bogey') +
    share(row, 'doubleBogey') +
    share(row, 'tripleOrWorse')

  const maxLeft = Math.max(...rows.map(leftArm), 1)
  const maxRight = Math.max(...rows.map(rightArm), 1)
  const fullWidth = maxLeft + maxRight

  return (
    <figure className="m-0">
      <figcaption className="label mb-3">
        How you score on each par type · share of holes played
      </figcaption>

      <div className="relative">
        {/* The par line. Everything right of it cost you strokes. */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-px"
          style={{ left: `${(maxLeft / fullWidth) * 100}%`, background: 'var(--hairline-strong)' }}
        />

        <div className="space-y-3">
          {rows.map((row) => {
            let cursor = maxLeft - leftArm(row)
            return (
              <div key={row.label} className="flex items-center gap-3">
                <span className="label w-12 shrink-0">{row.label}</span>
                <div className="relative h-7 flex-1">
                  {SCORE_CLASSES.map((scoreClass) => {
                    const width = share(row, scoreClass)
                    const left = cursor
                    cursor += width
                    if (width === 0) return null
                    const isActive =
                      active?.row === row.label && active.scoreClass === scoreClass
                    return (
                      <button
                        key={scoreClass}
                        type="button"
                        onClick={() =>
                          setActive(isActive ? null : { row: row.label, scoreClass })
                        }
                        className="absolute inset-y-0"
                        style={{
                          left: `${(left / fullWidth) * 100}%`,
                          width: `calc(${(width / fullWidth) * 100}% - 2px)`,
                          background: scoreClassColor[scoreClass],
                          borderRadius: '3px',
                          outline: isActive ? '2px solid var(--ink)' : 'none',
                          outlineOffset: '1px',
                        }}
                        aria-label={`${row.label}: ${row.counts[scoreClass]} ${scoreClassLabel[scoreClass]}`}
                      >
                        {/* Counts sit on any segment wide enough to hold them,
                            which is also the relief the light-mode amber needs. */}
                        {width / fullWidth > 0.12 && (
                          <span
                            className="numeral text-[11px]"
                            style={{ color: '#0a0f0c', mixBlendMode: 'normal' }}
                          >
                            {row.counts[scoreClass]}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {active && (
        <p className="prose-note mt-3">
          {active.row}:{' '}
          <strong style={{ color: 'var(--ink)' }}>
            {rows.find((row) => row.label === active.row)!.counts[active.scoreClass]}
          </strong>{' '}
          {scoreClassLabel[active.scoreClass].toLowerCase()} out of{' '}
          {rows.find((row) => row.label === active.row)!.total} holes.
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
