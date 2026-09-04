import { describe, expect, test, vi } from 'vitest'
import { createOpenGolfClient, OpenGolfError } from './client'
import { pebbleBeachSearch, pebbleBeachTees, pebbleBeachHoles } from './fixtures'

const stubFetch = (payload: unknown, status = 200) =>
  vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )

describe('createOpenGolfClient', () => {
  test('searches courses by name', async () => {
    const fetchImpl = stubFetch(pebbleBeachSearch)
    const client = createOpenGolfClient({ fetchImpl })

    const results = await client.searchCourses('pebble')

    expect(results[0]!.name).toBe('Pebble Beach Golf Links')
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('/v1/courses/search?q=pebble')
  })

  test('url encodes the query', async () => {
    const fetchImpl = stubFetch(pebbleBeachSearch)
    await createOpenGolfClient({ fetchImpl }).searchCourses('torrey pines & co')
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('q=torrey+pines+%26+co')
  })

  test('filters by state when one is given', async () => {
    const fetchImpl = stubFetch(pebbleBeachSearch)
    await createOpenGolfClient({ fetchImpl }).searchCourses('pines', { state: 'CA' })
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('state=CA')
  })

  test('fetches the rated tees for a course', async () => {
    const client = createOpenGolfClient({ fetchImpl: stubFetch(pebbleBeachTees) })
    const tees = await client.fetchTees('abc')
    expect(tees[0]!.slope).toBe(144)
  })

  test('fetches holes with par and stroke index', async () => {
    const client = createOpenGolfClient({ fetchImpl: stubFetch(pebbleBeachHoles) })
    const { holes } = await client.fetchHoles('abc')
    expect(holes[0]).toEqual({ number: 1, par: 4, strokeIndex: 6 })
  })

  test('raises a clear error when the service fails', async () => {
    const client = createOpenGolfClient({ fetchImpl: stubFetch({ error: 'nope' }, 503) })
    await expect(client.searchCourses('pebble')).rejects.toBeInstanceOf(OpenGolfError)
  })

  test('raises a clear error when the response is not the expected shape', async () => {
    const client = createOpenGolfClient({ fetchImpl: stubFetch({ unexpected: true }) })
    await expect(client.fetchTees('abc')).rejects.toBeInstanceOf(OpenGolfError)
  })
})
