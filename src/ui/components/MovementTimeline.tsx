import { useMemo } from 'react'
import { useAppState } from '../state/AppState'
import { IndexChangeCard } from './IndexChangeCard'
import { indexTimeline } from '@/domain/whs/retrospective'

/**
 * Every movement the Index has made, newest first.
 *
 * Answers the question a scoring record cannot: not "what did I shoot" but
 * "when did I actually get better, and what was carrying me at the time".
 */
export function MovementTimeline({ onClose }: { onClose: () => void }) {
  const { rounds } = useAppState()

  // Walking the whole record is quadratic, so it is done only while this is
  // open rather than on every render of the Index screen.
  const timeline = useMemo(() => [...indexTimeline(rounds)].reverse(), [rounds])

  return (
    <div
      className="fixed inset-0 z-30 overflow-y-auto"
      style={{ background: 'color-mix(in oklab, var(--ground) 94%, transparent)' }}
      role="dialog"
      aria-label="Index history"
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
          <h2 style={{ fontVariationSettings: "'wght' 620" }}>How your Index has moved</h2>
        </div>

        {timeline.length === 0 ? (
          <p className="prose-note">
            Your Index has not moved yet. Post a fourth round and its history starts here.
          </p>
        ) : (
          <ul className="space-y-3">
            {timeline.map((entry) => (
              <li key={entry.roundId}>
                <p className="label mb-1">{entry.date}</p>
                <IndexChangeCard retrospective={entry.retrospective} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
