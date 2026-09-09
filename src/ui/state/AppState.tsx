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
import { createSyncController, type SyncController } from '@/data/sync/controller'
import { createSupabaseRemote, supabaseConfigured } from '@/data/sync/supabase'
import type { RemoteStore } from '@/data/sync/remote'
import {
  clearUndoSnapshot,
  saveUndoSnapshot,
  summariseAdoption,
  takeUndoSnapshot,
  type AdoptionSummary,
} from '@/data/sync/adoption'

export type SyncStatus = 'guest' | 'idle' | 'syncing' | 'offline' | 'error'

interface AppState {
  rounds: Round[]
  record: ScoringRecord
  loading: boolean
  saveRound: (round: Round) => Promise<void>
  deleteRound: (id: string) => Promise<void>
  /** Re-read everything from storage, after an import replaces the record. */
  reload: () => Promise<void>
  repository: Repository
  courses: OpenGolfClient
  courseCache: CourseCache
  account: Account | null
  syncStatus: SyncStatus
  /** Sync now. Resolves even when it fails — the status carries the outcome. */
  syncNow: () => Promise<void>
  auth: AuthClient
  /**
   * Set once, by the first sync after a sign-in that merged this device's
   * rounds into the account. Null otherwise — including for every later sync.
   */
  adoption: AdoptionSummary | null
  /** Restore the device to how it was the moment before that first merge. */
  undoAdoption: () => Promise<void>
  /** Keep the merge, and stop showing the summary. */
  dismissAdoption: () => void
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
  // Identifies the controller a merge summary has already been produced for,
  // so only the first sync after a sign-in captures the undo snapshot and
  // reports a summary — a fresh sign-in always gets a new controller, so
  // comparing identity is enough, without threading account ids through here.
  const adoptedControllerRef = useRef<SyncController | null>(null)

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
    if (!controller) {
      setSyncStatus('guest')
      return
    }
    setSyncStatus('syncing')
    try {
      // Only the very first sync for this controller — i.e. this sign-in — is
      // a potential merge. Every later sync (on focus, regaining the network,
      // after a save) just synchronises and must not touch the undo snapshot
      // or produce a summary again.
      if (adoptedControllerRef.current !== controller) {
        const before = await repo.loadState()
        await saveUndoSnapshot(store, before)
        await controller.sync()
        const after = await repo.loadState()
        adoptedControllerRef.current = controller
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
  }, [controller, repo, store])

  const undoAdoption = useCallback(async () => {
    const snapshot = await takeUndoSnapshot(store)
    if (!snapshot) return
    await repo.replaceState(snapshot)
    setRounds(await repo.loadRounds())
    setAdoption(null)
  }, [store, repo])

  const dismissAdoption = useCallback(() => {
    void clearUndoSnapshot(store)
    setAdoption(null)
  }, [store])

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
      courses: client,
      courseCache: cache,
      account,
      syncStatus,
      syncNow,
      auth: authClient,
      adoption,
      undoAdoption,
      dismissAdoption,
    }),
    [
      rounds,
      record,
      loading,
      saveRound,
      deleteRound,
      reload,
      repo,
      client,
      cache,
      account,
      syncStatus,
      syncNow,
      authClient,
      adoption,
      undoAdoption,
      dismissAdoption,
    ],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppState {
  const state = useContext(AppStateContext)
  if (!state) throw new Error('useAppState must be used inside an AppProvider')
  return state
}
