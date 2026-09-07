import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IndexChangeCard } from './IndexChangeCard'
import type {
  IndexChangeCause,
  IndexRetrospective,
  MovementKind,
} from '@/domain/whs/retrospective'
import type { PostedDifferential } from '@/domain/whs/scoringRecord'

const differential = (overrides: Partial<PostedDifferential> = {}): PostedDifferential => ({
  roundId: 'r1',
  date: '2026-06-12',
  value: 6.1,
  grossScore: 79,
  adjustedGrossScore: 79,
  courseHandicapAtRound: 12,
  netDoubleBogeyApplied: true,
  exceptionalScoreReduction: 0,
  pairedWithRoundId: null,
  holeCount: 18,
  ...overrides,
})

const retro = (
  kind: MovementKind,
  strokes: number | null,
  causes: IndexChangeCause[] = [],
  overrides: Partial<IndexRetrospective> = {},
): IndexRetrospective => ({
  movement: { before: 10.0, after: strokes === null ? null : 10.0 + strokes, strokes, kind },
  causes,
  principalCause: causes[0] ?? null,
  countingSet: { startedCounting: [], stoppedCounting: [], tiedAtBoundary: false },
  pendingNine: null,
  ...overrides,
})

describe('IndexChangeCard', () => {
  test('leads with the direction and the new number', () => {
    render(
      <IndexChangeCard
        retrospective={retro('down', -1.0, [
          { kind: 'entered', strokes: -1.0, differential: differential() },
        ])}
      />,
    )

    expect(screen.getByText(/fell 1\.0/i)).toBeInTheDocument()
    expect(screen.getByText(/9\.0/)).toBeInTheDocument()
  })

  test('says a round changed nothing, and why that is not a fault', () => {
    // The most common "is this app broken?" moment.
    render(
      <IndexChangeCard
        retrospective={retro('steady', 0, [
          { kind: 'entered', strokes: 0, differential: differential({ grossScore: 92 }) },
        ])}
      />,
    )

    expect(screen.getByText(/did not move/i)).toBeInTheDocument()
    // Deliberately not "your best 8": with a short record the Rules use the
    // lowest one or two, and naming a fixed eight would be wrong.
    expect(screen.getByText(/not among the scores your index is drawn from/i))
      .toBeInTheDocument()
  })

  test('names the date of a round that aged out and absolves the player', () => {
    render(
      <IndexChangeCard
        retrospective={retro('up', 0.4, [
          {
            kind: 'agedOut',
            strokes: 0.4,
            differential: differential({ date: '2025-08-04', value: 2.0 }),
          },
        ])}
      />,
    )

    expect(screen.getByText(/2025-08-04/)).toBeInTheDocument()
    expect(screen.getByText(/nothing about your golf got worse/i)).toBeInTheDocument()
  })

  test('credits the Rules for the six-score drop rather than blaming the round', () => {
    render(
      <IndexChangeCard
        retrospective={retro('down', -1.0, [
          { kind: 'entered', strokes: 0, differential: differential({ grossScore: 122 }) },
          {
            kind: 'selection',
            strokes: -1.0,
            from: { scoreCount: 5, count: 1, adjustment: 0 },
            to: { scoreCount: 6, count: 2, adjustment: -1.0 },
          },
        ])}
      />,
    )

    expect(screen.getByText(/six scores/i)).toBeInTheDocument()
    expect(screen.getByText(/lowest two/i)).toBeInTheDocument()
  })

  test('explains a cap holding a rise back', () => {
    render(
      <IndexChangeCard
        retrospective={retro('up', 0.5, [
          {
            kind: 'cap',
            strokes: -0.7,
            from: 'none',
            to: 'soft',
            lowHandicapIndexBefore: 8.0,
            lowHandicapIndexAfter: 8.0,
          },
        ])}
      />,
    )

    expect(screen.getByText(/halved/i)).toBeInTheDocument()
    expect(screen.getByText(/0\.7/)).toBeInTheDocument()
  })

  test('reports a nine waiting for a partner instead of claiming a change', () => {
    render(
      <IndexChangeCard
        retrospective={retro('steady', 0, [], {
          pendingNine: { roundId: 'n1', date: '2026-06-20', differential: 9.0 },
        })}
      />,
    )

    expect(screen.getByText(/waiting for a second nine/i)).toBeInTheDocument()
  })

  test('summarises rather than listing when a great many rounds changed at once', () => {
    const many: IndexChangeCause[] = Array.from({ length: 12 }, (_, i) => ({
      kind: 'entered',
      strokes: -0.1,
      differential: differential({ roundId: `r${i}` }),
    }))
    render(<IndexChangeCard retrospective={retro('down', -1.2, many)} />)

    expect(screen.getByText(/12 rounds changed at once/i)).toBeInTheDocument()
  })

  test('says nothing at all before there is an index to explain', () => {
    const { container } = render(<IndexChangeCard retrospective={retro('first', null)} />)
    expect(container).toBeEmptyDOMElement()
  })
})
