import { useCallback, useEffect, useState } from 'react'
import { useAppState } from '../state/AppState'
import type { CachedCourse } from '@/data/repo/courseCache'
import type { CourseSummary } from '@/data/opengolf/map'

/**
 * Load a course's tees and holes, preferring anything already on the device.
 *
 * Cache first, then network: at the course, on a phone with one bar, the
 * version you looked at last week is far more useful than a spinner.
 */
export function useCourseDetail(summary: CourseSummary | null) {
  const { courses, courseCache } = useAppState()
  const [course, setCourse] = useState<CachedCourse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!summary) {
      setCourse(null)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      const cached = await courseCache.get(summary.id)
      if (cached && !cancelled) {
        setCourse(cached)
        setLoading(false)
      }

      try {
        const [tees, { holes, strokeIndexesEstimated }] = await Promise.all([
          courses.fetchTees(summary.id),
          courses.fetchHoles(summary.id),
        ])
        if (cancelled) return

        const fresh: CachedCourse = {
          id: summary.id,
          name: summary.name,
          city: summary.city,
          state: summary.state,
          tees,
          holes,
          strokeIndexesEstimated,
          cachedAt: new Date().toISOString(),
        }
        await courseCache.put(fresh)
        if (!cancelled) setCourse(fresh)
      } catch (cause) {
        // A cached copy is a complete answer, so a failed refresh is not an error.
        if (!cancelled && !cached) {
          setError(cause instanceof Error ? cause.message : 'Could not load that course.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [summary, courses, courseCache])

  return { course, loading, error }
}

/** Debounced course search, falling back to recently played courses. */
export function useCourseSearch(query: string) {
  const { courses, courseCache } = useAppState()
  const [results, setResults] = useState<CourseSummary[]>([])
  const [recent, setRecent] = useState<CourseSummary[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadRecent = useCallback(async () => {
    const cached = await courseCache.recent()
    setRecent(
      cached.map((course) => ({
        id: course.id,
        name: course.name,
        city: course.city,
        state: course.state,
        par: null,
        type: null,
      })),
    )
  }, [courseCache])

  useEffect(() => {
    void loadRecent()
  }, [loadRecent])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 3) {
      setResults([])
      setError(null)
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)
    const timer = setTimeout(() => {
      courses
        .searchCourses(trimmed)
        .then((found) => {
          if (!cancelled) {
            setResults(found)
            setError(null)
          }
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setResults([])
            setError(cause instanceof Error ? cause.message : 'Search failed.')
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, courses])

  return { results, recent, searching, error }
}
