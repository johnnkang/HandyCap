/**
 * Rendering helpers for screens and components that need app state.
 *
 * The real provider is used, wired to an in-memory store and stubbed network,
 * so these tests exercise the same data flow the app does — load, save, replay
 * — rather than a mock of it.
 */
import type { ReactElement } from 'react'
import { render, type RenderResult } from '@testing-library/react'
import { AppProvider } from '@/ui/state/AppState'
import { createRepository, type Repository } from '@/data/repo/repository'
import { createMemoryStore, type KeyValueStore } from '@/data/repo/store'
import type { OpenGolfClient } from '@/data/opengolf/client'
import type { CourseCache, CachedCourse } from '@/data/repo/courseCache'
import type { Round } from '@/domain/whs/types'
import type { AuthClient } from '@/data/auth/auth'
import type { RemoteStore } from '@/data/sync/remote'

/** A client that finds nothing, so a test opts in to whatever it needs. */
export const stubCourses = (overrides: Partial<OpenGolfClient> = {}): OpenGolfClient => ({
  searchCourses: async () => [],
  fetchTees: async () => [],
  fetchHoles: async () => ({ holes: [], strokeIndexesEstimated: false }),
  ...overrides,
})

export const stubCourseCache = (overrides: Partial<CourseCache> = {}): CourseCache => {
  const held = new Map<string, CachedCourse>()
  return {
    get: async (id) => held.get(id),
    put: async (course) => {
      held.set(course.id, course)
    },
    recent: async () => [...held.values()],
    ...overrides,
  }
}

export interface RenderOptions {
  /** Rounds already in storage when the screen mounts. */
  rounds?: Round[]
  courses?: OpenGolfClient
  courseCache?: CourseCache
  /** Supply one to control timing, e.g. a load that never resolves. */
  repository?: Repository
  auth?: AuthClient
  remoteFor?: (accountId: string) => RemoteStore
  /** Defaults to a fresh memory store, so no test reaches IndexedDB. */
  store?: KeyValueStore
}

export interface StatefulRender extends RenderResult {
  repository: Repository
}

/**
 * Render inside a real `AppProvider`. Seeded rounds are written to storage
 * before mounting, so the provider loads them exactly as it would on startup —
 * which means screens resolve asynchronously and tests should use `findBy`.
 */
export async function renderWithState(
  ui: ReactElement,
  {
    rounds = [],
    courses,
    courseCache,
    repository: supplied,
    auth,
    remoteFor,
    store,
  }: RenderOptions = {},
): Promise<StatefulRender> {
  const repository = supplied ?? createRepository(createMemoryStore())
  for (const round of rounds) await repository.saveRound(round)

  const result = render(
    <AppProvider
      repository={repository}
      courses={courses ?? stubCourses()}
      courseCache={courseCache ?? stubCourseCache()}
      auth={auth}
      remoteFor={remoteFor}
      store={store ?? createMemoryStore()}
    >
      {ui}
    </AppProvider>,
  )
  return { ...result, repository }
}
