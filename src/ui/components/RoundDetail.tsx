import { useAppState } from '../state/AppState'
import { Explain } from './Explain'
import { maxHoleScore } from '@/domain/whs/netDoubleBogey'
import type { RoundView } from '@/domain/stats/roundViews'

/** The full card for one round, including how its differential was arrived at. */
export function RoundDetail({ view, onClose }: { view: RoundView; onClose: () => void }) {
  const { deleteRound, record } = useAppState()
  const { round } = view
  const posted = record.differentials.find(
    (differential) => differential.roundId === round.id,
  )

  return (
    <div
      className="fixed inset-0 z-30 overflow-y-auto"
      style={{ background: 'color-mix(in oklab, var(--ground) 94%, transparent)' }}
      role="dialog"
      aria-label={`Round at ${round.course.name}`}
    >
      <div className="mx-auto max-w-[560px] space-y-5 px-4 pb-16 pt-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="tap grid h-9 w-9 place-items-center rounded-lg border"
            style={{ borderColor: 'var(--hairline)' }}
            aria-label="Close"
          >
            ✕
          </button>
          <div className="min-w-0">
            <h2 className="truncate" style={{ fontVariationSettings: "'wght' 620" }}>
              {round.course.name}
            </h2>
            <p className="label">
              {round.date} · {round.course.tee.name} · {round.holeCount} holes
            </p>
          </div>
        </div>

        {round.holeScores.length > 0 ? (
          <div className="panel overflow-x-auto p-4">
            <table className="w-full text-center">
              <caption className="label mb-2 text-left">Scorecard</caption>
              <thead>
                <tr>
                  <th scope="row" className="label pr-2 text-left">
                    Hole
                  </th>
                  {round.course.holes.map((hole) => (
                    <th key={hole.number} className="label px-1 font-normal">
                      {hole.number}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className="label pr-2 text-left">
                    Par
                  </th>
                  {round.course.holes.map((hole) => (
                    <td key={hole.number} className="label px-1">
                      {hole.par}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="label pr-2 text-left">
                    Score
                  </th>
                  {round.course.holes.map((hole, i) => {
                    const strokes = round.holeScores[i]?.strokes ?? null
                    const cap = maxHoleScore(
                      hole.par,
                      hole.strokeIndex,
                      posted?.courseHandicapAtRound ?? null,
                    )
                    const capped = strokes !== null && strokes > cap
                    return (
                      <td
                        key={hole.number}
                        className="numeral px-1 py-1 text-sm"
                        style={{ color: capped ? 'var(--amber)' : 'var(--ink)' }}
                        title={capped ? `Counted as ${cap} for handicap` : undefined}
                      >
                        {strokes ?? '–'}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="prose-note">
            Entered as a total only, so there is no hole detail and no net double bogey
            adjustment for this round.
          </p>
        )}

        {posted && (
          <div className="panel relative space-y-2 p-4">
            <p className="label flex items-center gap-1">
              How this round scored <Explain term="scoreDifferential" />
            </p>
            <Line label="Gross score" value={String(posted.grossScore)} />
            <Line
              label="Adjusted for maximum hole scores"
              value={String(posted.adjustedGrossScore)}
            />
            <Line label="Course rating" value={round.course.tee.courseRating.toFixed(1)} />
            <Line label="Slope" value={String(round.course.tee.slope)} />
            {posted.exceptionalScoreReduction !== 0 && (
              <Line
                label="Exceptional score reduction"
                value={posted.exceptionalScoreReduction.toFixed(1)}
              />
            )}
            <div className="hairline-top mt-2 flex items-baseline justify-between pt-2">
              <span className="label">Score Differential</span>
              <span className="numeral text-2xl">{posted.value.toFixed(1)}</span>
            </div>
          </div>
        )}

        {view.pending && (
          <p className="prose-note rounded-lg p-3" style={{ background: 'var(--raised)' }}>
            This nine scored {record.pendingNine?.differential.toFixed(1)} and is waiting for
            a second nine before it counts. <Explain term="pendingNine" />
          </p>
        )}

        {view.contributedToPair && (
          <p className="prose-note rounded-lg p-3" style={{ background: 'var(--raised)' }}>
            This nine was combined with a later nine into a single 18-hole score.
          </p>
        )}

        <button
          type="button"
          className="tap w-full rounded-xl border py-3 text-sm"
          style={{ borderColor: 'var(--flag)', color: 'var(--flag)' }}
          onClick={async () => {
            await deleteRound(round.id)
            onClose()
          }}
        >
          Delete this round
        </button>
      </div>
    </div>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="prose-note">{label}</span>
      <span className="numeral shrink-0">{value}</span>
    </div>
  )
}
