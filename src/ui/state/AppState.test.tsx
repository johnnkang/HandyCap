import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithState } from '@/test/ui'
import { useAppState } from './AppState'
import { scoresOfBogey, testRound } from '@/test/fixtures'
import type { Round } from '@/domain/whs/types'

/** Renders the state the rest of the app reads, so assertions stay on behaviour. */
function Probe({ toAdd }: { toAdd?: Round } = {}) {
  const { rounds, record, loading, saveRound, deleteRound } = useAppState()
  if (loading) return <p>loading</p>
  return (
    <div>
      <p data-testid="rounds">{rounds.length}</p>
      <p data-testid="index">{record.index === null ? 'none' : record.index.toFixed(1)}</p>
      <p data-testid="counting">{record.countingRoundIds.length}</p>
      {toAdd && (
        <button type="button" onClick={() => void saveRound(toAdd)}>
          post
        </button>
      )}
      <button type="button" onClick={() => void deleteRound(rounds[0]?.id ?? '')}>
        delete first
      </button>
    </div>
  )
}

const bogeyRound = (id: string, date: string) =>
  testRound({ id, date, strokes: scoresOfBogey() })

describe('AppProvider', () => {
  test('loads rounds already in storage on startup', async () => {
    await renderWithState(<Probe />, {
      rounds: [bogeyRound('a', '2026-05-01'), bogeyRound('b', '2026-05-08')],
    })
    expect(await screen.findByTestId('rounds')).toHaveTextContent('2')
  })

  test('derives the Handicap Index from stored rounds', async () => {
    // Three rounds of 90 on the neutral test course: differential 18.0 each,
    // and the three-score rule takes the lowest less 2.0.
    await renderWithState(<Probe />, {
      rounds: ['2026-05-01', '2026-05-08', '2026-05-15'].map((date, i) =>
        bogeyRound(String(i), date),
      ),
    })
    expect(await screen.findByTestId('index')).toHaveTextContent('16.0')
  })

  test('has no index below three rounds', async () => {
    await renderWithState(<Probe />, { rounds: [bogeyRound('a', '2026-05-01')] })
    expect(await screen.findByTestId('index')).toHaveTextContent('none')
  })

  test('posting a third round produces an index without a reload', async () => {
    const user = userEvent.setup()
    await renderWithState(<Probe toAdd={bogeyRound('c', '2026-05-15')} />, {
      rounds: [bogeyRound('a', '2026-05-01'), bogeyRound('b', '2026-05-08')],
    })
    expect(await screen.findByTestId('index')).toHaveTextContent('none')

    await user.click(screen.getByRole('button', { name: 'post' }))

    // The record is replayed from the saved rounds, so the screen updates from
    // the write alone — no refetch, no second render pass by the caller.
    expect(await screen.findByTestId('index')).toHaveTextContent('16.0')
    expect(screen.getByTestId('rounds')).toHaveTextContent('3')
  })

  test('deleting a round takes the index away again', async () => {
    const user = userEvent.setup()
    await renderWithState(<Probe />, {
      rounds: ['2026-05-01', '2026-05-08', '2026-05-15'].map((date, i) =>
        bogeyRound(String(i), date),
      ),
    })
    expect(await screen.findByTestId('index')).toHaveTextContent('16.0')

    await user.click(screen.getByRole('button', { name: 'delete first' }))

    expect(await screen.findByTestId('index')).toHaveTextContent('none')
  })

  test('an empty record reports no counting rounds', async () => {
    await renderWithState(<Probe />)
    expect(await screen.findByTestId('counting')).toHaveTextContent('0')
  })

  test('useAppState outside a provider fails loudly rather than silently', () => {
    // A component rendered outside the provider would otherwise read undefined
    // state and show a wrong handicap, which is the worst possible failure here.
    expect(() => render(<Probe />)).toThrow(/must be used inside an AppProvider/)
  })
})
