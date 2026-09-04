import { describe, expect, test } from 'vitest'
import { mapSearchResults, mapTees, mapHoles } from './map'
import { pebbleBeachSearch, pebbleBeachTees, pebbleBeachHoles, patchyCourse } from './fixtures'

describe('mapSearchResults', () => {
  test('maps a live search response to course summaries', () => {
    const [course] = mapSearchResults(pebbleBeachSearch)
    expect(course).toEqual({
      id: '40977ee8-33ee-4195-b6a2-99a4ca83c2bc',
      name: 'Pebble Beach Golf Links',
      city: 'Pebble Beach',
      state: 'CA',
      par: 72,
      type: 'Resort/Public',
    })
  })

  test('tolerates a response with no matches', () => {
    expect(mapSearchResults({ courses: [] })).toEqual([])
  })
})

describe('mapTees', () => {
  test('maps rated tees, normalising gender', () => {
    const tees = mapTees(pebbleBeachTees)
    expect(tees).toHaveLength(4)
    expect(tees[0]).toEqual({
      key: 'blue-male',
      name: 'Blue',
      color: 'blue',
      gender: 'male',
      courseRating: 74.9,
      slope: 144,
      par: 72,
      yardage: 6802,
    })
    expect(tees[2]!.gender).toBe('female')
  })

  test('drops tees with no rating, which cannot produce a differential', () => {
    const tees = mapTees(patchyCourse)
    expect(tees.map((tee) => tee.key)).toEqual(['blue-male'])
  })
})

describe('mapHoles', () => {
  test('maps par and stroke index', () => {
    const { holes, strokeIndexesEstimated } = mapHoles(pebbleBeachHoles)
    expect(holes[0]).toEqual({ number: 1, par: 4, strokeIndex: 6 })
    expect(holes[3]).toEqual({ number: 5, par: 3, strokeIndex: 14 })
    expect(strokeIndexesEstimated).toBe(false)
  })

  test('falls back to hole order when stroke indexes are missing, and says so', () => {
    const { holes, strokeIndexesEstimated } = mapHoles(patchyCourse)
    expect(holes).toEqual([
      { number: 1, par: 4, strokeIndex: 1 },
      { number: 2, par: 5, strokeIndex: 2 },
    ])
    expect(strokeIndexesEstimated).toBe(true)
  })

  test('sorts holes by number', () => {
    const { holes } = mapHoles({
      holes: [
        { number: 3, par: 4, handicap_index: 5 },
        { number: 1, par: 4, handicap_index: 1 },
        { number: 2, par: 3, handicap_index: 9 },
      ],
    })
    expect(holes.map((hole) => hole.number)).toEqual([1, 2, 3])
  })
})
