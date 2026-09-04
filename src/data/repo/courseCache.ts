import type { HoleInfo, TeeSet } from '@/domain/whs/types'
import type { KeyValueStore } from './store'

export interface CachedCourse {
  id: string
  name: string
  city: string | null
  state: string | null
  tees: TeeSet[]
  holes: HoleInfo[]
  strokeIndexesEstimated: boolean
  cachedAt: string
}

export interface CourseCache {
  get(courseId: string): Promise<CachedCourse | undefined>
  put(course: CachedCourse): Promise<void>
  recent(): Promise<CachedCourse[]>
}

const RECENT_KEY = 'handycap:recentCourses'
const key = (courseId: string) => `handycap:course:${courseId}`
const RECENT_LIMIT = 12

/**
 * Courses the player has actually looked at, kept on the device.
 *
 * This is what makes the app usable with no signal: the clubhouse you play
 * every week is already here, and posting a round never needs the network.
 */
export function createCourseCache(store: KeyValueStore): CourseCache {
  return {
    async get(courseId) {
      return store.get<CachedCourse>(key(courseId))
    },

    async put(course) {
      await store.set(key(course.id), course)
      const recent = (await store.get<string[]>(RECENT_KEY)) ?? []
      const next = [course.id, ...recent.filter((id) => id !== course.id)].slice(
        0,
        RECENT_LIMIT,
      )
      await store.set(RECENT_KEY, next)
    },

    async recent() {
      const ids = (await store.get<string[]>(RECENT_KEY)) ?? []
      const courses = await Promise.all(ids.map((id) => store.get<CachedCourse>(key(id))))
      return courses.filter((course): course is CachedCourse => course !== undefined)
    },
  }
}
