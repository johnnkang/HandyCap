import { describe, expect, test } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithState } from '@/test/ui'
import { useAppState } from './AppState'
import { scoresOfBogey, testRound } from '@/test/fixtures'
import type { Round } from '@/domain/whs/types'
import { createMemoryAuth, type Account, type AuthClient } from '@/data/auth/auth'
import { createMemoryRemote, type RemoteStore } from '@/data/sync/remote'
import { createMemoryStore, type KeyValueStore } from '@/data/repo/store'
import { createRepository, type Repository } from '@/data/repo/repository'

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

/**
 * A remote whose pull hangs until the test lets it through, so a test can hold
 * a sync at the network the way a slow signal at the course does.
 */
function gatedRemote(inner: RemoteStore) {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let open = false
  let pulls = 0
  const remote: RemoteStore = {
    ...inner,
    async pull(since) {
      pulls += 1
      if (!open) await gate
      return inner.pull(since)
    },
  }
  return {
    remote,
    pulls: () => pulls,
    open() {
      open = true
      release()
    },
  }
}

/** Surfaces everything the concurrency tests drive and observe. */
function SyncProbe() {
  const { rounds, account, syncStatus, adoption, loading, syncNow, signOut, undoAdoption } =
    useAppState()
  if (loading) return <p>loading</p>
  return (
    <div>
      <p data-testid="rounds">{rounds.length}</p>
      <p data-testid="account">{account?.email ?? 'guest'}</p>
      <p data-testid="status">{syncStatus}</p>
      <p data-testid="adoption">{adoption ? JSON.stringify(adoption) : 'none'}</p>
      <button type="button" onClick={() => void syncNow()}>
        sync again
      </button>
      <button
        type="button"
        onClick={() => {
          void signOut({ wipeLocal: true }).catch(() => {})
        }}
      >
        wipe
      </button>
      <button type="button" onClick={() => void undoAdoption()}>
        undo
      </button>
    </div>
  )
}

const signedIn = () =>
  createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } })

describe('concurrent whole-record writes', () => {
  test('a wiping sign-out is not undone by a sync already in flight', async () => {
    const user = userEvent.setup()
    const store = createMemoryStore()
    const base = createRepository(createMemoryStore())
    // The sync and the wipe both replace the whole record. Counting the writes
    // is how the test waits for both without assuming which one goes first.
    let writes = 0
    const repository: Repository = {
      ...base,
      async replaceState(state) {
        writes += 1
        await base.replaceState(state)
      },
    }
    const gated = gatedRemote(createMemoryRemote())

    await renderWithState(<SyncProbe />, {
      repository,
      store,
      auth: signedIn(),
      rounds: [bogeyRound('a', '2026-05-01')],
      remoteFor: () => gated.remote,
    })

    // Hold until the sync is genuinely out at the network.
    await waitFor(() => expect(gated.pulls()).toBe(1))

    // The golfer hands the borrowed phone back and taps "sign out and remove".
    await user.click(screen.getByRole('button', { name: 'wipe' }))
    gated.open()

    await waitFor(() => expect(writes).toBe(2))
    await waitFor(() => expect(screen.getByTestId('account')).toHaveTextContent('guest'))

    // The device was told it was clean. It has to actually be clean.
    expect(await repository.loadRounds()).toEqual([])
    expect(await store.get('handycap:cursors:acct-1')).toBeUndefined()
    expect(await store.get('handycap:adopted:acct-1')).toBeUndefined()
  })

  test('a wiping sign-out leaves no copy of the rounds behind', async () => {
    const user = userEvent.setup()
    const store = createMemoryStore()

    await renderWithState(<SyncProbe />, {
      store,
      auth: signedIn(),
      rounds: [bogeyRound('a', '2026-05-01')],
      remoteFor: () => createMemoryRemote(),
    })

    // The first sync keeps a full pre-merge copy of the record so the merge can
    // be undone. A golfer who never taps "Looks right" never clears it.
    await waitFor(() => expect(screen.getByTestId('adoption')).not.toHaveTextContent('none'))
    expect(await store.get('handycap:adoptionUndo')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'wipe' }))
    await waitFor(() => expect(screen.getByTestId('account')).toHaveTextContent('guest'))

    expect(await store.get('handycap:adoptionUndo')).toBeUndefined()
  })

  test('a sync started while the wipe is still running cannot put the rounds back', async () => {
    const user = userEvent.setup()
    const store = createMemoryStore()
    const auth = signedIn()
    // The wipe waits on a network sign-out, and "Sync now" is only disabled
    // while a sync is running — so it stays tappable for the whole round trip.
    let completeSignOut!: () => void
    const held = new Promise<void>((resolve) => {
      completeSignOut = resolve
    })
    const gatedAuth: AuthClient = {
      ...auth,
      async signOut() {
        await held
        await auth.signOut()
      },
    }

    const { repository } = await renderWithState(<SyncProbe />, {
      store,
      auth: gatedAuth,
      rounds: [bogeyRound('a', '2026-05-01')],
      remoteFor: () =>
        createMemoryRemote([
          {
            roundId: 'b',
            payload: bogeyRound('b', '2026-05-02'),
            updatedAt: '2026-05-02T00:00:00.000Z',
            deletedAt: null,
          },
        ]),
    })

    // Let the sign-in sync finish, so the wipe is the only thing on the chain.
    await waitFor(() => expect(screen.getByTestId('rounds')).toHaveTextContent('2'))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('idle'))

    await user.click(screen.getByRole('button', { name: 'wipe' }))
    await waitFor(() => expect(screen.getByTestId('rounds')).toHaveTextContent('0'))
    // Mid-wipe: the record is already empty, the sign-out has not come back.
    await user.click(screen.getByRole('button', { name: 'sync again' }))

    completeSignOut()
    await waitFor(() => expect(screen.getByTestId('account')).toHaveTextContent('guest'))
    // Anything the sync queued behind the wipe would run about here.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(await repository.loadRounds()).toEqual([])
    expect(await store.get('handycap:cursors:acct-1')).toBeUndefined()
  })

  test('a wipe whose sign-out fails does not silently stop syncing forever', async () => {
    const user = userEvent.setup()
    const auth = signedIn()
    // Supabase's client is a dynamic import, so signing out offline with that
    // chunk uncached rejects. The device is then still signed in and staying.
    const failing: AuthClient = {
      ...auth,
      async signOut() {
        throw new Error('offline')
      },
    }

    await renderWithState(<SyncProbe />, {
      store: createMemoryStore(),
      auth: failing,
      rounds: [bogeyRound('a', '2026-05-01')],
      remoteFor: () =>
        createMemoryRemote([
          {
            roundId: 'b',
            payload: bogeyRound('b', '2026-05-02'),
            updatedAt: '2026-05-02T00:00:00.000Z',
            deletedAt: null,
          },
        ]),
    })

    await waitFor(() => expect(screen.getByTestId('rounds')).toHaveTextContent('2'))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('idle'))

    await user.click(screen.getByRole('button', { name: 'wipe' }))
    await waitFor(() => expect(screen.getByTestId('rounds')).toHaveTextContent('0'))
    // Still signed in: the sign-out never happened.
    expect(screen.getByTestId('account')).toHaveTextContent('golfer@example.com')

    // So sync has to still work. A latch left set here would stop it for the
    // life of the provider while the screen still says everything is backed up.
    await user.click(screen.getByRole('button', { name: 'sync again' }))
    await waitFor(() => expect(screen.getByTestId('rounds')).toHaveTextContent('2'))
  })

  test('a token refresh for the same account does not resync', async () => {
    // `createMemoryAuth` only announces on a real sign-in or sign-out, and the
    // event under test is neither — so this is a purpose-built fake rather than
    // a contortion of that one.
    const account: Account = { id: 'acct-1', email: 'golfer@example.com' }
    const listeners = new Set<(next: Account | null) => void>()
    const auth: AuthClient = {
      async currentAccount() {
        return { ...account }
      },
      async sendMagicLink() {},
      async completeSignIn() {
        return null
      },
      async signOut() {},
      async deleteAccount() {},
      onChange(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }

    let pulls = 0
    const inner = createMemoryRemote()
    const remote: RemoteStore = {
      ...inner,
      async pull(since) {
        pulls += 1
        return inner.pull(since)
      },
    }

    await renderWithState(<SyncProbe />, {
      store: createMemoryStore(),
      auth,
      rounds: [bogeyRound('a', '2026-05-01')],
      remoteFor: () => remote,
    })

    await waitFor(() => expect(pulls).toBe(1))

    // What Supabase does on a token refresh: forward the session again as a
    // fresh object carrying the same id. Nothing about this device's
    // relationship with the account has changed.
    await act(async () => {
      listeners.forEach((listener) => listener({ ...account }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(pulls).toBe(1)
  })

  test('a second syncNow started mid-sync cannot spoil the undo snapshot', async () => {
    const user = userEvent.setup()
    const gated = gatedRemote(
      createMemoryRemote([
        {
          roundId: 'b',
          payload: bogeyRound('b', '2026-05-02'),
          updatedAt: '2026-05-02T00:00:00.000Z',
          deletedAt: null,
        },
      ]),
    )

    // The adoption marker is read from IndexedDB, and that read can be issued
    // while the marker is still unset and land after the first sync has already
    // merged the account in. Modelled here so the interleaving is deterministic
    // rather than a race the test wins by luck.
    const inner = createMemoryStore()
    let markMerged!: () => void
    const merged = new Promise<void>((resolve) => {
      markMerged = resolve
    })
    let markerReads = 0
    const store: KeyValueStore = {
      ...inner,
      async get<T>(key: string) {
        if (key !== 'handycap:adopted:acct-1') return inner.get<T>(key)
        markerReads += 1
        const value = await inner.get<T>(key)
        if (markerReads === 2) await merged
        return value
      },
      async set<T>(key: string, value: T) {
        await inner.set(key, value)
        if (key === 'handycap:adopted:acct-1') markMerged()
      },
    }

    const { repository } = await renderWithState(<SyncProbe />, {
      store,
      auth: signedIn(),
      rounds: [bogeyRound('a', '2026-05-01')],
      remoteFor: () => gated.remote,
    })

    await waitFor(() => expect(gated.pulls()).toBe(1))
    // A second trigger — a focus event, or React's development double-mount —
    // while the first sync is still out at the network.
    await user.click(screen.getByRole('button', { name: 'sync again' }))
    gated.open()

    await waitFor(() => expect(screen.getByTestId('adoption')).not.toHaveTextContent('none'))
    // Let anything the second call started run to completion before judging it.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Undo has to restore the record as it was before this sign-in, not the
    // merge it exists to reverse.
    await user.click(screen.getByRole('button', { name: 'undo' }))
    await waitFor(() => expect(screen.getByTestId('rounds')).toHaveTextContent('1'))
    expect((await repository.loadRounds()).map((round) => round.id)).toEqual(['a'])
  })
})
