import { useMemo, useState } from 'react'
import { MIN_SCORES_FOR_INDEX } from '@/domain/whs/handicapIndex'
import { explainRoundPosted } from '@/domain/whs/retrospective'
import { RecordStrip } from '../components/RecordStrip'
import { CourseHandicapCard } from '../components/CourseHandicapCard'
import { Explain } from '../components/Explain'
import { IndexChangeCard } from '../components/IndexChangeCard'
import { MovementTimeline } from '../components/MovementTimeline'
import { useAppState } from '../state/AppState'

export function IndexScreen() {
  const { record, rounds, loading } = useAppState()
  const [showHistory, setShowHistory] = useState(false)

  /**
   * What the most recent round did. Removing the newest round from the record
   * is the same comparison the timeline makes for its last entry, at a fraction
   * of the cost.
   */
  const lastChange = useMemo(() => {
    const latest = [...rounds].sort((a, b) => b.date.localeCompare(a.date))[0]
    return latest ? explainRoundPosted(rounds, latest.id) : null
  }, [rounds])

  if (loading) {
    return <p className="label px-4 pt-8">Loading your record…</p>
  }

  if (record.index === null) {
    return <GettingStarted posted={record.differentials.length} />
  }

  const [whole, decimal] = record.index.toFixed(1).split('.')

  return (
    <div className="space-y-6 px-4 pb-28 pt-6">
      <section className="rise relative">
        <p className="label flex items-center gap-1.5">
          Handicap Index <Explain term="handicapIndex" />
        </p>
        <p className="numeral mt-1 flex items-baseline leading-[0.85]">
          <span className="text-[5.5rem]">{whole}</span>
          <span className="text-[3rem]" style={{ color: 'var(--ink-faint)' }}>
            .{decimal}
          </span>
        </p>
      </section>

      {/*
        Only when there is something to attribute. A retrospective with no
        causes means nothing moved, and the pending-nine case below already
        says so in its own words.
      */}
      {lastChange && lastChange.causes.length > 0 && (
        <div className="rise" style={{ animationDelay: '40ms' }}>
          <IndexChangeCard retrospective={lastChange} />
        </div>
      )}

      <section className="rise panel p-4" style={{ animationDelay: '60ms' }}>
        <RecordStrip record={record} />
        <button
          type="button"
          onClick={() => setShowHistory(true)}
          className="label tap hairline-top mt-3 flex w-full items-center justify-between pt-3"
        >
          <span>See how your Index has moved</span>
          <span aria-hidden="true" style={{ color: 'var(--signal)' }}>
            →
          </span>
        </button>
      </section>

      {showHistory && <MovementTimeline onClose={() => setShowHistory(false)} />}

      {record.cap !== 'none' && (
        <section
          className="rise relative panel p-4"
          style={{ animationDelay: '100ms', borderColor: 'var(--amber)' }}
        >
          <p className="label flex items-center gap-1.5" style={{ color: 'var(--amber)' }}>
            {record.cap === 'soft' ? 'Soft cap in effect' : 'Hard cap in effect'}
            <Explain term={record.cap === 'soft' ? 'softCap' : 'hardCap'} />
          </p>
          <p className="prose-note mt-1">
            Your Index is being held back relative to your best of the last year
            {record.lowHandicapIndex !== null && (
              <> ({record.lowHandicapIndex.toFixed(1)})</>
            )}
            .
          </p>
        </section>
      )}

      {record.pendingNine && (
        <section className="rise relative panel p-4" style={{ animationDelay: '140ms' }}>
          <p className="label flex items-center gap-1.5">
            One nine pending <Explain term="pendingNine" />
          </p>
          <p className="prose-note mt-1">
            Your nine on {record.pendingNine.date} scored{' '}
            {record.pendingNine.differential.toFixed(1)} and is waiting for a second nine.
          </p>
        </section>
      )}

      <div className="rise" style={{ animationDelay: '180ms' }}>
        <CourseHandicapCard index={record.index} />
      </div>

      <p className="prose-note" style={{ color: 'var(--ink-faint)' }}>
        {record.differentials.length} round{record.differentials.length === 1 ? '' : 's'} on
        record. HandyCap follows the World Handicap System, but it is not an official
        handicap provider.
      </p>
    </div>
  )
}

function GettingStarted({ posted }: { posted: number }) {
  const remaining = MIN_SCORES_FOR_INDEX - posted
  const progress = posted / MIN_SCORES_FOR_INDEX

  return (
    <div className="rise space-y-6 px-4 pb-28 pt-10">
      <div className="flex items-center gap-5">
        <ProgressRing progress={progress} />
        <div>
          <p className="numeral text-2xl leading-tight">
            {remaining} more round{remaining === 1 ? '' : 's'}
          </p>
          <p className="label">to your first Handicap Index</p>
        </div>
      </div>

      <p className="prose-note">
        The World Handicap System needs three rounds before it will give you a number — one
        round is not enough to tell a good day from your real game. Post the last three
        rounds you played and HandyCap will work out the rest.
      </p>

      <p className="prose-note" style={{ color: 'var(--ink-faint)' }}>
        Never had a handicap? That is exactly who this is for. Enter your scores as you
        played them — HandyCap caps the blow-up holes for you.
      </p>
    </div>
  )
}

function ProgressRing({ progress }: { progress: number }) {
  const radius = 34
  const circumference = 2 * Math.PI * radius
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
      <circle cx="42" cy="42" r={radius} fill="none" stroke="var(--hairline)" strokeWidth="5" />
      <circle
        cx="42"
        cy="42"
        r={radius}
        fill="none"
        stroke="var(--signal)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.min(progress, 1))}
        transform="rotate(-90 42 42)"
      />
    </svg>
  )
}
