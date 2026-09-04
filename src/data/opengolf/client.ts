import { mapHoles, mapSearchResults, mapTees, type CourseSummary, type MappedHoles } from './map'
import type { TeeSet } from '@/domain/whs/types'

export const OPEN_GOLF_BASE_URL = 'https://api.opengolfapi.org'

/** Required by the ODbL licence wherever course data is shown. */
export const OPEN_GOLF_ATTRIBUTION =
  '© OpenStreetMap contributors (ODbL 1.0) via OpenGolfAPI'

/** Any failure reaching or understanding the course database. */
export class OpenGolfError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'OpenGolfError'
  }
}

export interface OpenGolfClientOptions {
  fetchImpl?: typeof fetch
  baseUrl?: string
  /** Optional free API key, which raises the anonymous 1,000/day limit. */
  apiKey?: string
}

export interface SearchOptions {
  /** Two-letter state code, e.g. "CA". */
  state?: string
  limit?: number
}

export interface OpenGolfClient {
  searchCourses(query: string, options?: SearchOptions): Promise<CourseSummary[]>
  fetchTees(courseId: string): Promise<TeeSet[]>
  fetchHoles(courseId: string): Promise<MappedHoles>
}

export function createOpenGolfClient(options: OpenGolfClientOptions = {}): OpenGolfClient {
  const {
    fetchImpl = globalThis.fetch.bind(globalThis),
    baseUrl = OPEN_GOLF_BASE_URL,
    apiKey,
  } = options

  async function get(path: string): Promise<unknown> {
    const url = `${baseUrl}${path}`
    let response: Response
    try {
      response = await fetchImpl(url, {
        headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      })
    } catch (cause) {
      throw new OpenGolfError('Could not reach the course database.', cause)
    }

    if (!response.ok) {
      throw new OpenGolfError(
        `The course database returned ${response.status}. Try again in a moment.`,
      )
    }
    try {
      return await response.json()
    } catch (cause) {
      throw new OpenGolfError('The course database sent something unreadable.', cause)
    }
  }

  /** Run a mapper, turning any schema mismatch into an OpenGolfError. */
  function parse<T>(mapper: (payload: unknown) => T, payload: unknown): T {
    try {
      return mapper(payload)
    } catch (cause) {
      throw new OpenGolfError('The course data was not in the expected format.', cause)
    }
  }

  return {
    async searchCourses(query, { state, limit = 20 } = {}) {
      const params = new URLSearchParams({ q: query, limit: String(limit) })
      if (state) params.set('state', state)
      return parse(mapSearchResults, await get(`/v1/courses/search?${params}`))
    },

    async fetchTees(courseId) {
      return parse(mapTees, await get(`/v1/courses/${encodeURIComponent(courseId)}/tees`))
    },

    async fetchHoles(courseId) {
      return parse(mapHoles, await get(`/v1/courses/${encodeURIComponent(courseId)}/holes`))
    },
  }
}
