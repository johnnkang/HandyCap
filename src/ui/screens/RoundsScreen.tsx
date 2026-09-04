import { useMemo, useState } from 'react'
import { useAppState } from '../state/AppState'
import { roundViews } from '@/domain/stats/roundViews'
import { differentialSummary, scoreSummary } from '@/domain/stats/roundStats'
import { Explain } from '../components/Explain'
import { RoundDetail } from '../components/RoundDetail'
import type { RoundView } from '@/domain/stats/roundViews'

type Filter = 'all' | '18' | '9'
type Ranking = 'score' | 'round'

export function RoundsScreen() {
  const { rounds, record } = useAppState()
  const [filter, setFilter] = useState<Filter>('all')
  const [ranking, setRanking] = useState<Ranking>('score')
  const [open, setOpen] = useState<RoundView | null>(null)

  const views = useMemo(() => roundViews(rounds, record), [rounds, record])
  const visible = views.filter((view) =>
    filter === 'all' ? true : view.round.holeCount === Number(filter),
  )

  const scores = scoreSummary(rounds, filter === '9' ? 9 : 18)
  const differentials = differentialSummary(record)
  const summary = ranking === 'score' ? scores : differentials
  const format = (value: number) => (ranking === 'score' ? String(value) : value.toFixed(1))

  if (rounds.length === 0) {
    return (
      <div className="px-4 pb-28 pt-10">
        <p className="prose-note">
          No rounds yet. Post one and this becomes your scoring history.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 px-4 pb-28 pt-6">
      <div className="rise flex gap-2">
        {(['all', '18', '9'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className="chip tap"
            data-selected={filter === option}
            onClick={() => setFilter(option)}
          >
            {option === 'all' ? 'All rounds' : `${option} holes`}
          </button>
        ))}
      </div>

      <section className="rise" style={{ animationDelay: '40ms' }}>
        <div className="mb-3 flex items-center justify-between">
          <p className="label">
            {ranking === 'score' ? 'By score' : 'By difficulty-adjusted round'}
          </p>
          <button
            type="button"
            className="chip tap"
            onClick={() => setRanking(ranking === 'score' ? 'round' : 'score')}
          >
            {ranking === 'score' ? 'Rank by difficulty' : 'Rank by score'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Tile label="Average" value={summary.average === null ? '–' : format(summary.average)} />
          <Tile
            label="Best"
            value={summary.best ? format(summary.best.value) : '–'}
            accent
          />
          <Tile label="Worst" value={summary.worst ? format(summary.worst.value) : '–'} />
        </div>

        {ranking === 'round' && (
          <p className="prose-note mt-3">
            Ranked by Score Differential, so a hard course gets its due — a 78 at a
            championship layout beats a 78 at an easy muni. <Explain term="scoreDifferential" />
          </p>
        )}
      </section>

      <ul className="space-y-2">
        {visible.map((view, position) => (
          <li key={view.round.id}>
            <button
              type="button"
              onClick={() => setOpen(view)}
              className="tap panel flex w-full items-center gap-3 px-4 py-3 text-left rise"
              style={{ animationDelay: `${Math.min(position, 8) * 25 + 80}ms` }}
            >
              <span
                aria-hidden="true"
                className="h-8 w-1 shrink-0 rounded-full"
                style={{
                  background: view.counting ? 'var(--signal)' : 'var(--hairline-strong)',
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate" style={{ fontVariationSettings: "'wght' 580" }}>
                  {view.round.course.name}
                </span>
                <span className="label">
                  {view.round.date} · {view.round.course.tee.name}
                  {view.round.holeCount === 9 && ` · ${view.round.nine} nine`}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="numeral block text-xl">{view.grossScore ?? '–'}</span>
                <span className="label">
                  {view.pending
                    ? 'pending'
                    : view.contributedToPair
                      ? 'paired'
                      : view.differential !== null
                        ? view.differential.toFixed(1)
                        : ''}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="prose-note" style={{ color: 'var(--ink-faint)' }}>
        A green bar marks a round currently counting toward your Index.{' '}
        <Explain term="countingRounds" />
      </p>

      {open && <RoundDetail view={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="panel px-3 py-3">
      <p className="label">{label}</p>
      <p
        className="numeral mt-0.5 text-2xl"
        style={{ color: accent ? 'var(--signal)' : 'var(--ink)' }}
      >
        {value}
      </p>
    </div>
  )
}
