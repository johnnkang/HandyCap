import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { buildScoringRecord, type ScoringRecord } from '@/domain/whs/scoringRecord'
import type { Round } from '@/domain/whs/types'
import { createRepository, type Repository } from '@/data/repo/repository'
import { createIndexedDbStore } from '@/data/repo/store'
import { createCourseCache, type CourseCache } from '@/data/repo/courseCache'
import { createOpenGolfClient, type OpenGolfClient } from '@/data/opengolf/client'

interface AppState {
  rounds: Round[]
  record: ScoringRecord
  loading: boolean
  saveRound: (round: Round) => Promise<void>
  deleteRound: (id: string) => Promise<void>
  repository: Repository
  courses: OpenGolfClient
  courseCache: CourseCache
}

const AppStateContext = createContext<AppState | null>(null)

export interface AppProviderProps {
  children: ReactNode
  /** Overridable so tests can supply an in-memory store and a stubbed client. */
  repository?: Repository
  courses?: OpenGolfClient
  courseCache?: CourseCache
}

export function AppProvider({
  children,
  repository,
  courses,
  courseCache,
}: AppProviderProps) {
  const store = useMemo(() => createIndexedDbStore(), [])
  const repo = useMemo(() => repository ?? createRepository(store), [repository, store])
  const cache = useMemo(() => courseCache ?? createCourseCache(store), [courseCache, store])
  const client = useMemo(() => courses ?? createOpenGolfClient(), [courses])

  const [rounds, setRounds] = useState<Round[]>([])
  const [loading, setLoading] = useState(true)

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

  const saveRound = useCallback(
    async (round: Round) => {
      await repo.saveRound(round)
      setRounds(await repo.loadRounds())
    },
    [repo],
  )

  const deleteRound = useCallback(
    async (id: string) => {
      await repo.deleteRound(id)
      setRounds(await repo.loadRounds())
    },
    [repo],
  )

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
      repository: repo,
      courses: client,
      courseCache: cache,
    }),
    [rounds, record, loading, saveRound, deleteRound, repo, client, cache],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppState {
  const state = useContext(AppStateContext)
  if (!state) throw new Error('useAppState must be used inside an AppProvider')
  return state
}
