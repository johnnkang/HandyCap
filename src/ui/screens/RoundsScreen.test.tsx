import { describe, expect, test } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoundsScreen } from './RoundsScreen'
import { renderWithState } from '@/test/ui'
import { scoresOfBogey, scoresOfPar, testCourse, testHoles, testRound } from '@/test/fixtures'
import type { Round } from '@/domain/whs/types'

/** 90, 90, 72 — an obvious best and worst so the summary tiles are checkable. */
const mixedRounds = (): Round[] => [
  testRound({ id: 'a', date: '2026-05-01', strokes: scoresOfBogey() }),
  testRound({ id: 'b', date: '2026-05-08', strokes: scoresOfBogey() }),
  testRound({ id: 'c', date: '2026-05-15', strokes: scoresOfPar() }),
]

/** A summary tile's value — the same numbers also appear in the round list. */
const tile = (label: string) => screen.getByText(label).parentElement!

const nineRound = () =>
  testRound({
    id: 'nine',
    date: '2026-05-22',
    holeCount: 9,
    nine: 'front',
    strokes: scoresOfBogey(9),
    course: testCourse({ holes: testHoles(9) }),
  })

describe('RoundsScreen', () => {
  test('invites a first round rather than showing an empty table', async () => {
    await renderWithState(<RoundsScreen />)
    expect(await screen.findByText(/no rounds yet/i)).toBeInTheDocument()
  })

  test('lists every round with its course and date', async () => {
    await renderWithState(<RoundsScreen />, { rounds: mixedRounds() })
    const list = await screen.findByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(within(list).getByText(/2026-05-15/)).toBeInTheDocument()
  })

  test('summarises average, best and worst by score', async () => {
    await renderWithState(<RoundsScreen />, { rounds: mixedRounds() })
    expect(await screen.findByText('By score')).toBeInTheDocument()
    // 90, 90 and 72 average 84; the best score is the lowest, not the highest.
    expect(tile('Average')).toHaveTextContent('84')
    expect(tile('Best')).toHaveTextContent('72')
    expect(tile('Worst')).toHaveTextContent('90')
  })

  test('re-ranks by Score Differential so a hard course gets its due', async () => {
    const user = userEvent.setup()
    await renderWithState(<RoundsScreen />, { rounds: mixedRounds() })

    await user.click(await screen.findByRole('button', { name: /rank by difficulty/i }))

    expect(screen.getByText('By difficulty-adjusted round')).toBeInTheDocument()
    // The neutral test course rates 72.0 off slope 113, so 72 gross is 0.0 and
    // 90 gross is 18.0 — tiles now read in differentials, not strokes.
    expect(tile('Best')).toHaveTextContent('0.0')
    expect(tile('Worst')).toHaveTextContent('18.0')
  })

  test('filters down to nine-hole rounds', async () => {
    const user = userEvent.setup()
    await renderWithState(<RoundsScreen />, { rounds: [...mixedRounds(), nineRound()] })
    expect(within(await screen.findByRole('list')).getAllByRole('listitem')).toHaveLength(4)

    await user.click(screen.getByRole('button', { name: '9 holes' }))

    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByText(/front nine/i)).toBeInTheDocument()
  })

  test('marks an unpaired nine as pending rather than showing a differential', async () => {
    await renderWithState(<RoundsScreen />, { rounds: [...mixedRounds(), nineRound()] })
    const list = await screen.findByRole('list')
    expect(within(list).getByText('pending')).toBeInTheDocument()
  })

  test('opens a round to explain how its number was reached', async () => {
    const user = userEvent.setup()
    await renderWithState(<RoundsScreen />, { rounds: mixedRounds() })

    const list = await screen.findByRole('list')
    await user.click(within(list).getAllByRole('button')[0]!)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})

describe('what a round is worth', () => {
  const totals = (values: number[]): Round[] =>
    values.map((totalStrokes, i) =>
      testRound({ id: `t${i}`, date: `2026-0${i + 1}-01`, totalStrokes }),
    )

  test('a round detail says what the index would be without it', async () => {
    // The question behind every scorecard: is this round helping me?
    const user = userEvent.setup()
    await renderWithState(<RoundsScreen />, { rounds: totals([90, 90, 90, 80, 88]) })

    const list = await screen.findByRole('list')
    await user.click(within(list).getAllByRole('button')[0]!)

    expect(await screen.findByText(/without this round/i)).toBeInTheDocument()
  })
})
