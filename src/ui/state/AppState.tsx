import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { buildScoringRecord, type ScoringRecord } from '@/domain/whs/scoringRecord'
import type { Round } from '@/domain/whs/types'
import { createRepository, type Repository } from '@/data/repo/repository'
import { createIndexedDbStore, type KeyValueStore } from '@/data/repo/store'
import { createCourseCache, type CourseCache } from '@/data/repo/courseCache'
import { createOpenGolfClient, type OpenGolfClient } from '@/data/opengolf/client'
import { createMemoryAuth, type Account, type AuthClient } from '@/data/auth/auth'
import { createSupabaseAuth } from '@/data/auth/supabase'
import { createSyncController, cursorKey } from '@/data/sync/controller'
import { createSupabaseRemote, supabaseConfigured } from '@/data/sync/supabase'
import type { RemoteStore } from '@/data/sync/remote'
import { emptySyncState } from '@/data/sync/types'
import {
  clearUndoSnapshot,
  saveUndoSnapshot,
  summariseAdoption,
  takeUndoSnapshot,
  type AdoptionSummary,
} from '@/data/sync/adoption'

export type SyncStatus = 'guest' | 'idle' | 'syncing' | 'offline' | 'error'

/**
 * Whether this account has ever been adopted on this device, persisted
 * beside the sync cursors rather than held in a ref — a ref resets on every
 * mount, and a returning signed-in user's session is restored on cold start,
 * which is indistinguishable from a fresh sign-in at that point.
 */
const adoptedKey = (accountId: string) => `handycap:adopted:${accountId}`

interface AppState {
  rounds: Round[]
  record: ScoringRecord
  loading: boolean
  saveRound: (round: Round) => Promise<void>
  deleteRound: (id: string) => Promise<void>
  /** Re-read everything from storage, after an import replaces the record. */
  reload: () => Promise<void>
  repository: Repository
  /**
   * The same injectable key/value store backing sync cursors and the undo
   * snapshot, exposed so a small persisted UI flag — the backup nudge's
   * dismissal — does not need its own dedicated AppState method.
   */
  store: KeyValueStore
  courses: OpenGolfClient
  courseCache: CourseCache
  account: Account | null
  syncStatus: SyncStatus
  /** Sync now. Resolves even when it fails — the status carries the outcome. */
  syncNow: () => Promise<void>
  auth: AuthClient
  /**
   * Set once per account per device, by the first sync that ever merges this
   * device's rounds into that account — a marker persisted in `store`, not a
   * per-mount flag, because a returning signed-in user's session is restored
   * on every cold start and would otherwise look like a fresh sign-in every
   * time. Null on every later sync, and for a guest.
   */
  adoption: AdoptionSummary | null
  /**
   * The only thing this can honestly promise: the local record goes back to
   * how it was before this sign-in, and the device signs out. Rounds already
   * pushed to the account are not un-pushed — a real "undo" of the merge
   * itself is not well-defined once the records are one thing.
   */
  undoAdoption: () => Promise<void>
  /** Keep the merge, and stop showing the summary. */
  dismissAdoption: () => void
  /**
   * Sign out. By default local rounds are left exactly as they are — signing
   * out should never be the way someone loses their history. `wipeLocal` is
   * for a borrowed or shared phone, where the point is to leave nothing
   * behind.
   */
  signOut: (options: { wipeLocal: boolean }) => Promise<void>
  /**
   * Delete the account itself: the synced rows and the auth user. Local
   * rounds are deliberately untouched — they are still the golfer's, and the
   * app keeps working as a guest afterwards.
   */
  deleteAccount: () => Promise<void>
}

const AppStateContext = createContext<AppState | null>(null)

export interface AppProviderProps {
  children: ReactNode
  /** Overridable so tests can supply an in-memory store and a stubbed client. */
  repository?: Repository
  courses?: OpenGolfClient
  courseCache?: CourseCache
  auth?: AuthClient
  remoteFor?: (accountId: string) => RemoteStore
  /**
   * Overridable so tests never reach IndexedDB. Sync cursors, the undo
   * snapshot and the nudge flag all live here, so unlike the existing
   * `repository` override this one is load-bearing for tests.
   */
  store?: KeyValueStore
}

export function AppProvider({
  children,
  repository,
  courses,
  courseCache,
  auth,
  remoteFor,
  store: suppliedStore,
}: AppProviderProps) {
  const store = useMemo(() => suppliedStore ?? createIndexedDbStore(), [suppliedStore])
  const repo = useMemo(() => repository ?? createRepository(store), [repository, store])
  const cache = useMemo(() => courseCache ?? createCourseCache(store), [courseCache, store])
  const client = useMemo(() => courses ?? createOpenGolfClient(), [courses])
  const authClient = useMemo(
    () => auth ?? (supabaseConfigured() ? createSupabaseAuth() : createMemoryAuth()),
    [auth],
  )
  const makeRemote = useMemo(
    () => remoteFor ?? ((accountId: string) => createSupabaseRemote(accountId)),
    [remoteFor],
  )

  const [rounds, setRounds] = useState<Round[]>([])
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState<Account | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('guest')
  const [adoption, setAdoption] = useState<AdoptionSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    repo
      .loadRounds()
      .then((loaded) => {
        if (!cancelled) setRounds(loaded)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [repo])

  // Adopt whatever session already exists, then follow it.
  useEffect(() => {
    let cancelled = false
    void authClient.currentAccount().then((existing) => {
      if (!cancelled) setAccount(existing)
    })
    const unsubscribe = authClient.onChange((next) => {
      if (!cancelled) setAccount(next)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [authClient])

  const controller = useMemo(
    () =>
      account
        ? createSyncController({
            repository: repo,
            store,
            remote: makeRemote(account.id),
            accountId: account.id,
          })
        : null,
    [account, repo, store, makeRemote],
  )

  const syncNow = useCallback(async () => {
    if (!controller || !account) {
      setSyncStatus('guest')
      return
    }
    setSyncStatus('syncing')
    try {
      // Adoption happens once per account per device, ever — guarded by a
      // marker persisted in `store`, not by anything that resets on mount.
      // Every sync after that marker is set (on focus, regaining the
      // network, after a save, or on a later cold start) just synchronises
      // and must not touch the undo snapshot or produce a summary again.
      const key = adoptedKey(account.id)
      const alreadyAdopted = await store.get<boolean>(key)
      if (!alreadyAdopted) {
        const before = await repo.loadState()
        await saveUndoSnapshot(store, before)
        await controller.sync()
        const after = await repo.loadState()
        // Set before the card is shown, so an interrupted session (a throw
        // between here and the render) cannot re-run adoption either.
        await store.set(key, true)
        setAdoption(summariseAdoption(before, after))
      } else {
        await controller.sync()
      }
      setRounds(await repo.loadRounds())
      setSyncStatus('idle')
    } catch {
      // A sync that fails is a sync that has not happened yet. Local data is
      // untouched and the app stays fully usable.
      setSyncStatus(navigator.onLine ? 'error' : 'offline')
    }
  }, [controller, account, repo, store])

  const undoAdoption = useCallback(async () => {
    if (!account) return
    const snapshot = await takeUndoSnapshot(store)
    if (!snapshot) return
    await repo.replaceState(snapshot)
    setRounds(await repo.loadRounds())
    // Clear this device's memory of the merge, so a later sign-in to the same
    // account adopts cleanly rather than resuming from a cursor already past
    // the record it is trying to re-adopt.
    await store.remove(adoptedKey(account.id))
    await store.remove(cursorKey(account.id))
    setAdoption(null)
    // The only way this is genuinely reversible: the rounds already pushed to
    // the account are not un-pushed, so staying signed in would just pull the
    // merged record straight back on the next sync.
    await authClient.signOut()
  }, [store, repo, account, authClient])

  const dismissAdoption = useCallback(() => {
    void clearUndoSnapshot(store)
    setAdoption(null)
  }, [store])

  const signOut = useCallback(
    async ({ wipeLocal }: { wipeLocal: boolean }) => {
      if (wipeLocal && account) {
        // Wipe first, so a failure is reported while the user is still in a
        // state they recognise rather than after the screen has flipped to
        // signed-out and told them the device is clean.
        await repo.replaceState(emptySyncState())
        setRounds([])
        // The cursors describe a record this device no longer holds. Left
        // behind, signing back in would pull nothing — every row on the server
        // sits below the stored high-water mark — and the golfer would open an
        // empty app that looks exactly like their history was destroyed.
        await store.remove(cursorKey(account.id))
        await store.remove(adoptedKey(account.id))
      }
      await authClient.signOut()
      setSyncStatus('guest')
    },
    [authClient, repo, store, account],
  )

  const deleteAccount = useCallback(async () => {
    // The rows go first: if deleting the auth user fails, the golf data is
    // already gone, which is the safer half to lose.
    if (account) await makeRemote(account.id).deleteEverything()
    await authClient.deleteAccount()
    setSyncStatus('guest')
    // Local data is deliberately untouched. It is still theirs, and the app
    // keeps working as a guest.
  }, [account, authClient, makeRemote])

  // Sync on sign-in, on returning to the app, and on regaining the network.
  useEffect(() => {
    if (!controller) {
      setSyncStatus('guest')
      // A guest must never see a summary left over from a session that has
      // since signed out — the card is scoped to the sign-in that produced it.
      setAdoption(null)
      return
    }
    void syncNow()
    const onFocus = () => void syncNow()
    window.addEventListener('online', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('online', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [controller, syncNow])

  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleSync = useCallback(() => {
    if (!controller) return
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => void syncNow(), 2000)
  }, [controller, syncNow])

  // Clear a pending debounced sync so it never fires after the provider is gone.
  useEffect(
    () => () => {
      if (syncTimer.current) clearTimeout(syncTimer.current)
    },
    [],
  )

  const saveRound = useCallback(
    async (round: Round) => {
      await repo.saveRound(round)
      setRounds(await repo.loadRounds())
      void scheduleSync()
    },
    [repo, scheduleSync],
  )

  const deleteRound = useCallback(
    async (id: string) => {
      await repo.deleteRound(id)
      setRounds(await repo.loadRounds())
      void scheduleSync()
    },
    [repo, scheduleSync],
  )

  const reload = useCallback(async () => {
    setRounds(await repo.loadRounds())
  }, [repo])

  // The whole record is replayed on every change. With a scoring record of a
  // few hundred rounds that is microseconds, and it makes the index and every
  // derived stat impossible to get out of sync.
  const record = useMemo(() => buildScoringRecord(rounds), [rounds])

  const value = useMemo(
    () => ({
      rounds,
      record,
      loading,
      saveRound,
      deleteRound,
      reload,
      repository: repo,
      store,
      courses: client,
      courseCache: cache,
      account,
      syncStatus,
      syncNow,
      auth: authClient,
      adoption,
      undoAdoption,
      dismissAdoption,
      signOut,
      deleteAccount,
    }),
    [
      rounds,
      record,
      loading,
      saveRound,
      deleteRound,
      reload,
      repo,
      store,
      client,
      cache,
      account,
      syncStatus,
      syncNow,
      authClient,
      adoption,
      undoAdoption,
      dismissAdoption,
      signOut,
      deleteAccount,
    ],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppState {
  const state = useContext(AppStateContext)
  if (!state) throw new Error('useAppState must be used inside an AppProvider')
  return state
}
