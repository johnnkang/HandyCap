import { useMemo } from 'react'
import { useAppState } from '../state/AppState'
import { parTypeStats } from '@/domain/stats/parTypeStats'
import { coursePerformance, shotStats } from '@/domain/stats/roundStats'
import { ScoreDistribution } from '../charts/ScoreDistribution'

const percent = (value: number | null) =>
  value === null ? '–' : `${Math.round(value * 100)}%`

export function InsightsScreen() {
  const { rounds, record } = useAppState()

  const analysis = useMemo(() => parTypeStats(rounds), [rounds])
  const shots = useMemo(() => shotStats(rounds), [rounds])
  const courses = useMemo(() => coursePerformance(record, rounds), [record, rounds])

  if (analysis.byPar.length === 0) {
    return (
      <div className="px-4 pb-28 pt-10">
        <p className="prose-note">
          Insights need hole-by-hole scores. Post a round using the scorecard rather than a
          total and this fills in.
        </p>
      </div>
    )
  }

  const strongest = analysis.byPar.find((parType) => parType.par === analysis.strongest)
  const weakest = analysis.byPar.find((parType) => parType.par === analysis.weakest)

  return (
    <div className="space-y-6 px-4 pb-28 pt-6">
      {strongest && weakest && strongest.par !== weakest.par && (
        <section className="rise">
          <p className="label">Your strongest holes</p>
          <p className="numeral text-4xl leading-tight">Par {strongest.par}s</p>
          <p className="prose-note mt-2">
            You play par {strongest.par}s{' '}
            <strong style={{ color: 'var(--signal)' }}>
              {Math.abs(strongest.relativeToOverall).toFixed(2)} strokes per hole
            </strong>{' '}
            better than your own average, and par {weakest.par}s{' '}
            {Math.abs(weakest.relativeToOverall).toFixed(2)} worse. That is measured per
            hole, because a course has far more par 4s than par 3s and raw totals only
            reflect that.
          </p>
        </section>
      )}

      <section className="rise panel p-4" style={{ animationDelay: '40ms' }}>
        <p className="label mb-3">Strokes over par, per hole</p>
        <div className="space-y-2">
          {analysis.byPar.map((parType) => (
            <div key={parType.par} className="flex items-center gap-3">
              <span className="label w-12 shrink-0">Par {parType.par}</span>
              <div className="h-6 flex-1" style={{ background: 'var(--raised)', borderRadius: '3px' }}>
                <div
                  className="h-full"
                  style={{
                    width: `${Math.min((parType.averageOverPar / 2.5) * 100, 100)}%`,
                    background: 'var(--signal)',
                    borderRadius: '3px',
                    opacity: 0.55 + 0.45 * (1 - parType.relativeToOverall),
                  }}
                />
              </div>
              <span className="numeral w-12 shrink-0 text-right text-sm">
                +{parType.averageOverPar.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        <p className="prose-note mt-3">
          Your overall average is +{analysis.overallOverPar.toFixed(2)} per hole.
        </p>
      </section>

      <section className="rise panel p-4" style={{ animationDelay: '80ms' }}>
        <ScoreDistribution byPar={analysis.byPar} />
      </section>

      <section className="rise" style={{ animationDelay: '120ms' }}>
        <p className="label mb-3">Where the strokes go</p>
        <div className="grid grid-cols-3 gap-2">
          <Tile
            label="Putts / round"
            value={shots.averagePutts === null ? '–' : shots.averagePutts.toFixed(1)}
          />
          <Tile label="Fairways" value={percent(shots.fairwayHitRate)} />
          <Tile label="Greens" value={percent(shots.greenInRegulationRate)} />
        </div>
        {shots.averagePutts === null && (
          <p className="prose-note mt-2">
            Record putts, fairways and greens on the scorecard to see what is actually
            costing you strokes.
          </p>
        )}
      </section>

      {analysis.byPar.some((parType) => parType.greenInRegulationRate !== null) && (
        <section className="rise panel p-4" style={{ animationDelay: '160ms' }}>
          <p className="label mb-3">By par type</p>
          <table className="w-full">
            <thead>
              <tr>
                <th className="label text-left font-normal">Par</th>
                <th className="label text-right font-normal">Putts</th>
                <th className="label text-right font-normal">Fairway</th>
                <th className="label text-right font-normal">Green</th>
              </tr>
            </thead>
            <tbody>
              {analysis.byPar.map((parType) => (
                <tr key={parType.par}>
                  <td className="numeral py-1 text-sm">{parType.par}</td>
                  <td className="numeral py-1 text-right text-sm">
                    {parType.averagePutts?.toFixed(2) ?? '–'}
                  </td>
                  <td className="numeral py-1 text-right text-sm">
                    {percent(parType.fairwayHitRate)}
                  </td>
                  <td className="numeral py-1 text-right text-sm">
                    {percent(parType.greenInRegulationRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {courses.length > 1 && (
        <section className="rise" style={{ animationDelay: '200ms' }}>
          <p className="label mb-3">Courses, best average first</p>
          <ul className="space-y-2">
            {courses.map((course) => (
              <li key={course.courseId} className="panel flex items-center justify-between px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate" style={{ fontVariationSettings: "'wght' 560" }}>
                    {course.courseName}
                  </span>
                  <span className="label">
                    {course.roundsPlayed} round{course.roundsPlayed === 1 ? '' : 's'} · best{' '}
                    {course.bestDifferential.toFixed(1)}
                  </span>
                </span>
                <span className="numeral text-xl">{course.averageDifferential.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel px-3 py-3">
      <p className="label">{label}</p>
      <p className="numeral mt-0.5 text-2xl">{value}</p>
    </div>
  )
}
