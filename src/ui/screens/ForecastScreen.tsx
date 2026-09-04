import { useMemo, useState } from 'react'
import { useAppState } from '../state/AppState'
import { Explain } from '../components/Explain'
import { TrajectoryChart, type TrajectoryPointView } from '../charts/TrajectoryChart'
import {
  differentialNeededNextRound,
  nextRollOff,
  projectIndex,
  recentForm,
  roundsToReachTarget,
  scoreForDifferential,
  trajectory,
} from '@/domain/whs/projection'

const PROJECTION_ROUNDS = 8

export function ForecastScreen() {
  const { record, rounds } = useAppState()
  const [target, setTarget] = useState('')

  const form = recentForm(record, 5)
  const rollOff = nextRollOff(record)

  /** The tee the player has used most recently, as the basis for score examples. */
  const referenceTee = useMemo(() => {
    const latest = [...rounds].sort((a, b) => b.date.localeCompare(a.date))[0]
    return latest?.course.tee ?? null
  }, [rounds])

  const path = useMemo<TrajectoryPointView[]>(() => {
    if (record.index === null || form === null) return []
    const history = record.indexHistory.slice(-6).map((entry) => ({
      label: entry.date,
      index: entry.index,
      projected: false,
    }))
    const future = trajectory(record, form, PROJECTION_ROUNDS)
      .filter((point) => point.index !== null)
      .map((point) => ({
        label: `+${point.roundsAhead} rounds`,
        index: point.index!,
        projected: true,
      }))
    return [...history, ...future]
  }, [record, form])

  if (record.index === null) {
    return (
      <div className="px-4 pb-28 pt-10">
        <p className="prose-note">
          Forecasts need an established Index. Post three rounds and this opens up.
        </p>
      </div>
    )
  }

  const targetValue = Number(target)
  const targetValid = target.trim() !== '' && Number.isFinite(targetValue)
  const neededDifferential = targetValid
    ? differentialNeededNextRound(record, targetValue)
    : null
  const roundsNeeded =
    targetValid && form !== null ? roundsToReachTarget(record, targetValue, form) : null

  return (
    <div className="space-y-6 px-4 pb-28 pt-6">
      {path.length >= 2 && (
        <section className="rise panel p-4">
          <TrajectoryChart points={path} />
          <p className="prose-note mt-3">
            Assumes you keep playing to your recent form of {form?.toFixed(1)}. It is a
            projection, not a promise.
          </p>
        </section>
      )}

      <section className="rise panel relative p-4" style={{ animationDelay: '40ms' }}>
        <p className="label flex items-center gap-1">
          What one more round would do <Explain term="handicapIndex" />
        </p>
        <ul className="mt-3 space-y-2">
          {[-6, -3, 0, 3, 6].map((offset) => {
            const candidate = (form ?? record.index!) + offset
            const projected = projectIndex(record, candidate)
            if (projected === null) return null
            const change = projected - record.index!
            return (
              <li key={offset} className="flex items-baseline justify-between gap-3">
                <span className="prose-note">
                  Shoot a {candidate.toFixed(1)} differential
                  {referenceTee && (
                    <> (about {scoreForDifferential(candidate, referenceTee)} at your last course)</>
                  )}
                </span>
                <span className="numeral shrink-0">
                  {projected.toFixed(1)}
                  <span
                    className="label ml-1"
                    style={{
                      color:
                        change < 0 ? 'var(--signal)' : change > 0 ? 'var(--amber)' : 'var(--ink-faint)',
                    }}
                  >
                    {change === 0 ? '–' : change < 0 ? '↓' : '↑'}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      {rollOff && (
        <section className="rise panel p-4" style={{ animationDelay: '80ms' }}>
          <p className="label">Rolling off next</p>
          <p className="numeral mt-1 text-3xl">{rollOff.value.toFixed(1)}</p>
          <p className="prose-note mt-2">
            Your round from {rollOff.date} leaves the 20-score window when you next post.
            An Index can drift up with nothing else changing, purely because a good round
            aged out — this is the number to beat to stand still.
          </p>
        </section>
      )}

      <section className="rise panel p-4" style={{ animationDelay: '120ms' }}>
        <label className="label mb-2 block" htmlFor="goal">
          Chasing a number?
        </label>
        <input
          id="goal"
          className="field"
          inputMode="decimal"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          placeholder={`e.g. ${Math.max(0, Math.floor(record.index - 2))}`}
        />

        {targetValid && (
          <div className="mt-4 space-y-3">
            {targetValue >= record.index ? (
              <p className="prose-note">You are already at or below {targetValue.toFixed(1)}.</p>
            ) : (
              <>
                <div>
                  <p className="label">In one round</p>
                  <p className="prose-note">
                    {neededDifferential === null ? (
                      <>No single round can get you to {targetValue.toFixed(1)} — this one
                      needs a run of good scoring.</>
                    ) : (
                      <>
                        You would need a differential of{' '}
                        <strong style={{ color: 'var(--ink)' }}>
                          {neededDifferential.toFixed(1)}
                        </strong>
                        {referenceTee && (
                          <>
                            , about{' '}
                            <strong style={{ color: 'var(--ink)' }}>
                              {scoreForDifferential(neededDifferential, referenceTee)}
                            </strong>{' '}
                            at your last course
                          </>
                        )}
                        .
                      </>
                    )}
                  </p>
                </div>

                <div>
                  <p className="label">At your current form</p>
                  <p className="prose-note">
                    {roundsNeeded === null ? (
                      <>Playing to your recent form of {form?.toFixed(1)} will not get you
                      there — you need to shoot lower, not just play more.</>
                    ) : (
                      <>
                        About{' '}
                        <strong style={{ color: 'var(--ink)' }}>{roundsNeeded} more rounds</strong>{' '}
                        at your recent form.
                      </>
                    )}
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {referenceTee && (
        <p className="prose-note" style={{ color: 'var(--ink-faint)' }}>
          Score examples use {referenceTee.name} tees at your most recent course (rating{' '}
          {referenceTee.courseRating.toFixed(1)}, slope {referenceTee.slope}). A differential
          of {record.index.toFixed(1)} there is about{' '}
          {scoreForDifferential(record.index, referenceTee)} strokes.
        </p>
      )}
    </div>
  )
}
