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
import { createRepository } from '@/data/repo/repository'
import { useAppState } from '@/ui/state/AppState'

const round = (id: string, date: string) => testRound({ id, date, strokes: scoresOfBogey() })

const remoteRound = (id: string, date: string) => ({
  roundId: id,
  payload: round(id, date),
  updatedAt: `${date}T00:00:00.000Z`,
  deletedAt: null,
})

/**
 * Surfaces the round count, sign-in state, and sync status, so a test can
 * watch undo actually restore data and can wait for a sync to genuinely
 * finish rather than for a coincidentally-already-true condition.
 */
function RoundsProbe() {
  const { rounds, account, syncStatus, loading } = useAppState()
  if (loading) return <p>loading</p>
  return (
    <div>
      <p data-testid="rounds">{rounds.length}</p>
      <p data-testid="account">{account?.email ?? 'guest'}</p>
      <p data-testid="status">{syncStatus}</p>
    </div>
  )
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
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument()
  })

  test('renders nothing when there is nothing to reconcile on either side', async () => {
    const auth = createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } })

    await renderWithState(
      <>
        <RoundsProbe />
        <MergeSummary />
      </>,
      {
        auth,
        remoteFor: () => createMemoryRemote([]),
        store: createMemoryStore(),
      },
    )

    // Wait for the sync to actually settle, not just for the account to
    // appear — otherwise this could pass by checking before `adoption` has
    // been set at all, which would prove nothing about the `total === 0`
    // guard.
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('idle'))
    expect(screen.queryByText(/your account had/i)).not.toBeInTheDocument()
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

  test('flags two rounds that look posted twice after a merge', async () => {
    // Same date, same fixture course and tee, same bogey score — the classic
    // shape of the same round entered once per device.
    const remote = createMemoryRemote([remoteRound('x1', '2026-04-01')])
    const auth = createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } })

    await renderWithState(<MergeSummary />, {
      auth,
      remoteFor: () => remote,
      store: createMemoryStore(),
      rounds: [round('a', '2026-04-01')],
    })

    expect(await screen.findByText(/your account had/i)).toBeInTheDocument()
    expect(screen.getByText(/posted twice/i)).toBeInTheDocument()
  })

  test('says nothing about duplicates for a clean record', async () => {
    const remote = createMemoryRemote([remoteRound('x1', '2026-04-01')])
    const auth = createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } })

    await renderWithState(<MergeSummary />, {
      auth,
      remoteFor: () => remote,
      store: createMemoryStore(),
      rounds: [round('a', '2026-05-01')],
    })

    expect(await screen.findByText(/your account had/i)).toBeInTheDocument()
    expect(screen.queryByText(/posted twice/i)).not.toBeInTheDocument()
  })

  test('the undo action restores the pre-merge round count and leaves the user signed out', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Undo and sign out' }))

    await waitFor(() => expect(screen.getByTestId('rounds')).toHaveTextContent('1'))
    expect(screen.getByTestId('account')).toHaveTextContent('guest')
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

  test('an already-adopted device shows no card on a later mount', async () => {
    // The bug this guards against: a `useRef` marker resets on every mount,
    // so a returning signed-in user's session — restored on cold start,
    // indistinguishable from a fresh sign-in — would re-run adoption and show
    // a nonsense card every time the app opens. The marker must survive a
    // whole new AppProvider instance, so this shares one `store` *and* one
    // `repository` across two independent mounts, the way IndexedDB would
    // survive an app restart in the real app.
    const store = createMemoryStore()
    const repository = createRepository(store)
    const remote = createMemoryRemote([remoteRound('x1', '2026-04-01')])
    const auth = createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } })

    const first = await renderWithState(
      <>
        <RoundsProbe />
        <MergeSummary />
      </>,
      {
        auth,
        remoteFor: () => remote,
        store,
        repository,
        rounds: [round('a', '2026-05-01'), round('b', '2026-05-02')],
      },
    )
    expect(await screen.findByText(/your account had 1 round\b/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('idle'))
    first.unmount()

    // A cold start: a brand-new provider tree, the same account still
    // signed in, the same persisted store and repository — nothing new for
    // the account to bring, since the previous sync already pulled it all
    // down and this device already has all of it. The round count is already
    // 3 before this mount's own sync even runs (it is the same persisted
    // repository), so the thing worth waiting for is the *second* sync
    // actually finishing — not a round count that was already correct.
    await renderWithState(
      <>
        <RoundsProbe />
        <MergeSummary />
      </>,
      {
        auth,
        remoteFor: () => remote,
        store,
        repository,
      },
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('idle'))
    expect(screen.getByTestId('rounds')).toHaveTextContent('3')
    expect(screen.queryByText(/your account had/i)).not.toBeInTheDocument()
  })
})
