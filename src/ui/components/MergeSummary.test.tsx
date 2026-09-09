import { describe, expect, test } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithState } from '@/test/ui'
import { MergeSummary } from './MergeSummary'
import { testRound, scoresOfBogey } from '@/test/fixtures'
import { createMemoryAuth } from '@/data/auth/auth'
import { createMemoryRemote } from '@/data/sync/remote'
import type { RemoteStore } from '@/data/sync/remote'
import { createMemoryStore } from '@/data/repo/store'
import { useAppState } from '@/ui/state/AppState'

const round = (id: string, date: string) => testRound({ id, date, strokes: scoresOfBogey() })

const remoteRound = (id: string, date: string) => ({
  roundId: id,
  payload: round(id, date),
  updatedAt: `${date}T00:00:00.000Z`,
  deletedAt: null,
})

/** Surfaces the round count, so a test can watch undo actually restore data. */
function RoundsProbe() {
  const { rounds, loading } = useAppState()
  if (loading) return <p>loading</p>
  return <p data-testid="rounds">{rounds.length}</p>
}

/** Wraps a memory remote so a test can prove a second sync actually ran. */
function countingRemote(seed: Parameters<typeof createMemoryRemote>[0]) {
  const base = createMemoryRemote(seed)
  let pulls = 0
  const remote: RemoteStore = {
    pull: async (since) => {
      pulls += 1
      return base.pull(since)
    },
    push: (rows) => base.push(rows),
    deleteEverything: () => base.deleteEverything(),
  }
  return { remote, pullCount: () => pulls }
}

describe('MergeSummary', () => {
  test('renders nothing for a guest', async () => {
    await renderWithState(<MergeSummary />, { rounds: [round('a', '2026-05-01')] })
    // A guest never syncs, so there is nothing to wait for — the absence holds.
    expect(screen.queryByText(/your account had/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  test('shows what the device had, what the account brought, and the total', async () => {
    const remote = createMemoryRemote([
      remoteRound('x1', '2026-04-01'),
      remoteRound('x2', '2026-04-02'),
    ])
    const auth = createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } })

    await renderWithState(<MergeSummary />, {
      auth,
      remoteFor: () => remote,
      store: createMemoryStore(),
      rounds: [round('a', '2026-05-01')],
    })

    expect(await screen.findByText(/your account had 2 rounds/i)).toBeInTheDocument()
    expect(screen.getByText(/this device added 1 round\b/i)).toBeInTheDocument()
    expect(screen.getByText(/you now have 3/i)).toBeInTheDocument()
  })

  test('Undo restores the pre-merge round count', async () => {
    const user = userEvent.setup()
    const remote = createMemoryRemote([
      remoteRound('x1', '2026-04-01'),
      remoteRound('x2', '2026-04-02'),
    ])
    const auth = createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } })
    const store = createMemoryStore()

    await renderWithState(
      <>
        <RoundsProbe />
        <MergeSummary />
      </>,
      {
        auth,
        remoteFor: () => remote,
        store,
        rounds: [round('a', '2026-05-01')],
      },
    )

    expect(await screen.findByText(/you now have 3/i)).toBeInTheDocument()
    expect(screen.getByTestId('rounds')).toHaveTextContent('3')

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    await waitFor(() => expect(screen.getByTestId('rounds')).toHaveTextContent('1'))
    expect(screen.queryByText(/your account had/i)).not.toBeInTheDocument()
  })

  test('Looks right dismisses the card, and a later sync does not bring it back', async () => {
    const user = userEvent.setup()
    const { remote, pullCount } = countingRemote([remoteRound('x1', '2026-04-01')])
    const auth = createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } })

    await renderWithState(<MergeSummary />, {
      auth,
      remoteFor: () => remote,
      store: createMemoryStore(),
      rounds: [round('a', '2026-05-01')],
    })

    expect(await screen.findByText(/your account had/i)).toBeInTheDocument()
    await waitFor(() => expect(pullCount()).toBeGreaterThanOrEqual(1))

    await user.click(screen.getByRole('button', { name: 'Looks right' }))
    expect(screen.queryByText(/your account had/i)).not.toBeInTheDocument()

    const pullsBeforeSecondSync = pullCount()
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    // Prove a second sync actually happened, so this is a real assertion about
    // routine syncs — not just about a card that was never re-checked.
    await waitFor(() => expect(pullCount()).toBeGreaterThan(pullsBeforeSecondSync))

    expect(screen.queryByText(/your account had/i)).not.toBeInTheDocument()
  })
})
