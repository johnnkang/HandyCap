import { describe, expect, test } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithState } from '@/test/ui'
import { useAppState } from './AppState'
import { scoresOfBogey, testRound } from '@/test/fixtures'
import type { Round } from '@/domain/whs/types'
import { createMemoryAuth } from '@/data/auth/auth'
import { createMemoryRemote } from '@/data/sync/remote'
import { createMemoryStore } from '@/data/repo/store'

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

/** Surfaces the account and sync fields the account screen reads. */
function AccountProbe() {
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

describe('account and sync', () => {
  test('is a guest until signed in, and still fully usable', async () => {
    await renderWithState(<AccountProbe />, { rounds: [bogeyRound('a', '2026-05-01')] })
    expect(await screen.findByTestId('account')).toHaveTextContent('guest')
    expect(screen.getByTestId('status')).toHaveTextContent('guest')
    expect(screen.getByTestId('rounds')).toHaveTextContent('1')
  })

  test('pulls the account record on sign-in', async () => {
    const remote = createMemoryRemote([
      {
        roundId: 'b',
        payload: bogeyRound('b', '2026-05-02'),
        updatedAt: '2026-05-02T00:00:00.000Z',
        deletedAt: null,
      },
    ])
    const auth = createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } })

    await renderWithState(<AccountProbe />, {
      auth,
      store: createMemoryStore(),
      remoteFor: () => remote,
    })

    expect(await screen.findByTestId('account')).toHaveTextContent('golfer@example.com')
    await waitFor(() => expect(screen.getByTestId('rounds')).toHaveTextContent('1'))
  })

  test('a sync failure never breaks the app', async () => {
    const auth = createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } })

    await renderWithState(<AccountProbe />, {
      auth,
      store: createMemoryStore(),
      rounds: [bogeyRound('a', '2026-05-01')],
      remoteFor: () => ({
        pull: async () => {
          throw new Error('offline')
        },
        push: async () => {},
        deleteEverything: async () => {},
      }),
    })

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toMatch(/offline|error/),
    )
    // The record is untouched by the failure.
    expect(screen.getByTestId('rounds')).toHaveTextContent('1')
  })
})

/** Surfaces the adoption summary the merge-summary card is built from. */
function AdoptionProbe() {
  const { adoption, account, loading } = useAppState()
  if (loading) return <p>loading</p>
  return (
    <div>
      <p data-testid="account">{account?.email ?? 'guest'}</p>
      <p data-testid="adoption">{adoption ? JSON.stringify(adoption) : 'none'}</p>
    </div>
  )
}

describe('adoption summary', () => {
  test('a guest never carries a summary left over from a signed-out session', async () => {
    const auth = createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } })
    const remote = createMemoryRemote([
      {
        roundId: 'b',
        payload: bogeyRound('b', '2026-05-02'),
        updatedAt: '2026-05-02T00:00:00.000Z',
        deletedAt: null,
      },
    ])

    await renderWithState(<AdoptionProbe />, {
      auth,
      store: createMemoryStore(),
      rounds: [bogeyRound('a', '2026-05-01')],
      remoteFor: () => remote,
    })

    // The first sync for this sign-in merged an unfamiliar round in, so it
    // produced a summary.
    await waitFor(() => expect(screen.getByTestId('adoption')).not.toHaveTextContent('none'))

    await auth.signOut()

    // Signing out must not leave the card behind for the next guest session.
    // Both fields settle from the same account-change effect, but not
    // necessarily in the same commit, so each gets its own wait rather than
    // assuming one implies the other.
    await waitFor(() => expect(screen.getByTestId('account')).toHaveTextContent('guest'))
    await waitFor(() => expect(screen.getByTestId('adoption')).toHaveTextContent('none'))
  })
})
