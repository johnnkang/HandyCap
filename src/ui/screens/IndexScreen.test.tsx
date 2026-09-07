import { describe, expect, test } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IndexScreen } from './IndexScreen'
import { renderWithState } from '@/test/ui'
import { createRepository } from '@/data/repo/repository'
import { createMemoryStore } from '@/data/repo/store'
import { scoresOfBogey, testCourse, testHoles, testRound } from '@/test/fixtures'
import type { Round } from '@/domain/whs/types'

const bogeyRounds = (dates: string[]): Round[] =>
  dates.map((date, i) => testRound({ id: `r${i}`, date, strokes: scoresOfBogey() }))

const threeRounds = bogeyRounds(['2026-05-01', '2026-05-08', '2026-05-15'])

describe('IndexScreen', () => {
  describe('before an index exists', () => {
    test('counts down the rounds still needed rather than showing a placeholder', async () => {
      await renderWithState(<IndexScreen />, { rounds: bogeyRounds(['2026-05-01']) })
      expect(await screen.findByText('2 more rounds')).toBeInTheDocument()
    })

    test('uses the singular when one round is left', async () => {
      await renderWithState(<IndexScreen />, {
        rounds: bogeyRounds(['2026-05-01', '2026-05-08']),
      })
      expect(await screen.findByText('1 more round')).toBeInTheDocument()
    })

    test('explains why three rounds are needed, not just that they are', async () => {
      // The product thesis is legibility: a bare requirement invites the player
      // to think the app is stalling.
      await renderWithState(<IndexScreen />)
      expect(
        await screen.findByText(/one round is not enough to tell a good day/i),
      ).toBeInTheDocument()
    })
  })

  describe('with an index', () => {
    test('shows the index split into whole and decimal parts', async () => {
      // Three rounds of 90 on the neutral course: 18.0 less the 2.0 adjustment.
      await renderWithState(<IndexScreen />, { rounds: threeRounds })
      expect(await screen.findByText('16')).toBeInTheDocument()
      expect(screen.getByText('.0')).toBeInTheDocument()
    })

    test('reports how many rounds are on record', async () => {
      await renderWithState(<IndexScreen />, { rounds: threeRounds })
      expect(await screen.findByText(/3 rounds on record/i)).toBeInTheDocument()
    })

    test('discloses that it is not an official handicap', async () => {
      await renderWithState(<IndexScreen />, { rounds: threeRounds })
      expect(await screen.findByText(/not an official handicap provider/i)).toBeInTheDocument()
    })

    test('offers a course handicap without needing a round posted', async () => {
      await renderWithState(<IndexScreen />, { rounds: threeRounds })
      expect(await screen.findByText(/playing somewhere today/i)).toBeInTheDocument()
    })
  })

  test('surfaces a lone nine as pending rather than silently dropping it', async () => {
    // A nine cannot become a differential on its own, and a player who posted
    // one and saw nothing happen would reasonably assume the app lost it.
    const nine = testRound({
      id: 'nine',
      date: '2026-05-22',
      holeCount: 9,
      nine: 'front',
      strokes: scoresOfBogey(9),
      course: testCourse({ holes: testHoles(9) }),
    })
    await renderWithState(<IndexScreen />, { rounds: [...threeRounds, nine] })

    expect(await screen.findByText('One nine pending')).toBeInTheDocument()
    expect(screen.getByText(/waiting for a second nine/i)).toBeInTheDocument()
  })

  test('shows a loading state rather than a wrong number while storage opens', async () => {
    // Rendering "0" or an empty index during the read would be worse than
    // saying nothing: a golfer glancing at the screen would believe it.
    const stalled = createRepository(createMemoryStore())
    await renderWithState(<IndexScreen />, {
      repository: { ...stalled, loadRounds: () => new Promise(() => {}) },
    })

    expect(await screen.findByText(/loading your record/i)).toBeInTheDocument()
    expect(screen.queryByText(/more round/i)).not.toBeInTheDocument()
  })
})

describe('explaining the last change', () => {
  /** Totals on the neutral tee, where the differential is exactly total - 72. */
  const totals = (values: number[]): Round[] =>
    values.map((totalStrokes, i) =>
      testRound({ id: `t${i}`, date: `2026-0${i + 1}-01`, totalStrokes }),
    )

  test('explains what the most recent round did to the index', async () => {
    await renderWithState(<IndexScreen />, { rounds: totals([90, 90, 90, 80]) })

    expect(await screen.findByText(/your index fell/i)).toBeInTheDocument()
  })

  test('says nothing to explain when the index has only just arrived', async () => {
    // A first index is an arrival, not a movement — there is no "before".
    await renderWithState(<IndexScreen />, { rounds: totals([90, 90, 90]) })

    await screen.findByText('16')
    expect(screen.queryByText(/your index fell/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/your index rose/i)).not.toBeInTheDocument()
  })

  test('opens a browsable history of every movement', async () => {
    const user = userEvent.setup()
    await renderWithState(<IndexScreen />, { rounds: totals([90, 90, 90, 80, 88]) })

    await user.click(await screen.findByRole('button', { name: /how your index has moved/i }))

    const history = await screen.findByRole('dialog', { name: /index history/i })
    expect(history).toBeInTheDocument()
  })
})
