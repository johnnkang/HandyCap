import { Explain } from './Explain'
import type { IndexChangeCause, IndexRetrospective } from '@/domain/whs/retrospective'

/** Beyond this many causes a list stops informing and starts overwhelming. */
const TOO_MANY_TO_LIST = 5

/**
 * Why the Handicap Index is where it is, in plain English.
 *
 * The domain returns causes as data with a stroke value each; every word a
 * player reads is written here. That split is deliberate — the arithmetic is
 * pinned by unit tests and the wording stays free to change.
 */
export function IndexChangeCard({ retrospective }: { retrospective: IndexRetrospective }) {
  const { movement, causes, pendingNine } = retrospective

  if (pendingNine && causes.length === 0) {
    return (
      <Panel>
        <p className="label">Nothing changed yet</p>
        <p className="prose-note mt-1">
          Your nine on {pendingNine.date} scored {pendingNine.differential.toFixed(1)} and is
          waiting for a second nine before it counts. Nothing is lost.{' '}
          <Explain term="pendingNine" />
        </p>
      </Panel>
    )
  }

  // Before a first index there is nothing to attribute, and after a deletion
  // took one away there is nothing left to describe.
  if (movement.strokes === null) return null

  return (
    <Panel>
      <p className="label">{headline(movement.strokes)}</p>
      <p className="numeral mt-1 text-2xl leading-none">
        {movement.before?.toFixed(1)} <span aria-hidden="true">→</span>{' '}
        <span style={{ color: tint(movement.strokes) }}>{movement.after?.toFixed(1)}</span>
      </p>

      {causes.length > TOO_MANY_TO_LIST ? (
        <p className="prose-note mt-3">
          {causes.length} rounds changed at once, so this is the net effect rather than a
          round-by-round story.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {causes.map((cause, position) => (
            <li key={position} className="prose-note">
              {sentenceFor(cause)}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="panel relative p-4">{children}</section>
}

const tint = (strokes: number) =>
  strokes < 0 ? 'var(--signal)' : strokes > 0 ? 'var(--amber)' : 'var(--ink)'

function headline(strokes: number): string {
  if (strokes === 0) return 'Your Index did not move'
  const size = Math.abs(strokes).toFixed(1)
  return strokes < 0 ? `Your Index fell ${size}` : `Your Index rose ${size}`
}

/**
 * One cause as a sentence. Each says what happened *and why*, because the
 * "why" is the whole reason this app exists — every other app shows the number
 * and leaves the player to guess.
 */
function sentenceFor(cause: IndexChangeCause): React.ReactNode {
  switch (cause.kind) {
    case 'entered':
      return cause.strokes === 0 ? (
        <>
          Your {cause.differential.grossScore} scored{' '}
          {cause.differential.value.toFixed(1)} and joined your record, but it is not among
          the scores your Index is drawn from, so it changed nothing. It starts to matter as
          better rounds age out. <Explain term="countingRounds" />
        </>
      ) : (
        <>
          Your {cause.differential.grossScore} scored{' '}
          {cause.differential.value.toFixed(1)} and is now among the scores your Index is
          drawn from, worth {worth(cause.strokes)}.
        </>
      )

    case 'agedOut':
      return (
        <>
          Your {cause.differential.grossScore} from {cause.differential.date} scored{' '}
          {cause.differential.value.toFixed(1)} and has left the 20-score window, worth{' '}
          {worth(cause.strokes)}. Nothing about your golf got worse — a good round simply
          aged out. <Explain term="countingRounds" />
        </>
      )

    case 'deleted':
      return (
        <>
          Removing your {cause.differential.grossScore} from {cause.differential.date} took
          a {cause.differential.value.toFixed(1)} out of your record, worth{' '}
          {worth(cause.strokes)}.
        </>
      )

    case 'revised':
      return (
        <>
          Your round from {cause.date} was re-scored from {cause.from.toFixed(1)} to{' '}
          {cause.to.toFixed(1)}, worth {worth(cause.strokes)}. Adding an earlier round changed
          the Course Handicap you held that day, and with it the maximum score on your worst
          hole. <Explain term="netDoubleBogey" />
        </>
      )

    case 'selection':
      return (
        <>
          With {numberWord(cause.to.scoreCount)} scores the Rules read your record
          differently. They now average your{' '}
          {cause.to.count === 1 ? 'lowest score' : `lowest ${numberWord(cause.to.count)}`}
          {cause.to.adjustment !== 0 && <> and subtract {Math.abs(cause.to.adjustment).toFixed(1)}</>}
          , worth {worth(cause.strokes)}. A short record over-represents your best golf, so
          the Rules correct for it.
        </>
      )

    case 'exceptionalScore':
      return (
        <>
          Rule 5.9 reductions in your record changed, worth {worth(cause.strokes)}. A round
          far better than your Index lowers it at once rather than waiting for the average to
          catch up, and the effect fades as that round ages out.{' '}
          <Explain term="exceptionalScore" />
        </>
      )

    case 'cap':
      return cause.to === 'none' ? (
        <>
          The cap on your Index has been released, worth {worth(cause.strokes)}.{' '}
          <Explain term="softCap" />
        </>
      ) : (
        <>
          Your Index is rising faster than the Rules allow. Beyond 3.0 strokes above your best
          of the last year
          {cause.lowHandicapIndexAfter !== null && (
            <> ({cause.lowHandicapIndexAfter.toFixed(1)})</>
          )}
          , increases are halved
          {cause.to === 'hard' && <> and can never exceed 5.0</>}, holding back{' '}
          {Math.abs(cause.strokes).toFixed(1)}.{' '}
          <Explain term={cause.to === 'hard' ? 'hardCap' : 'softCap'} />
        </>
      )
  }
}

/** A stroke contribution as a phrase, signed the way a golfer thinks about it. */
function worth(strokes: number): string {
  if (strokes === 0) return 'nothing'
  const size = Math.abs(strokes).toFixed(1)
  return strokes < 0 ? `${size} off` : `${size} on`
}

const WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty',
]
const numberWord = (value: number) => WORDS[value] ?? String(value)
