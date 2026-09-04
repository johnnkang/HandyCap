import type { CourseSnapshot, HoleInfo, HoleScore, Round, TeeSet } from '@/domain/whs/types'

/** Par 72, one stroke per hole of difficulty spread front/back in the usual way. */
const PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4]
const STROKE_INDEXES = [1, 3, 5, 7, 9, 11, 13, 15, 17, 2, 4, 6, 8, 10, 12, 14, 16, 18]

export const testHoles = (holeCount: 9 | 18 = 18): HoleInfo[] =>
  PARS.slice(0, holeCount).map((par, i) => ({
    number: i + 1,
    par,
    strokeIndex: STROKE_INDEXES[i]!,
  }))

/** A neutral tee: slope 113 and a rating equal to par, so score minus 72 is the differential. */
export const neutralTee = (overrides: Partial<TeeSet> = {}): TeeSet => ({
  key: 'white-male',
  name: 'White',
  color: 'white',
  gender: 'male',
  courseRating: 72.0,
  slope: 113,
  par: 72,
  yardage: 6200,
  ...overrides,
})

export const testCourse = (overrides: Partial<CourseSnapshot> = {}): CourseSnapshot => ({
  id: 'course-1',
  name: 'Test Links',
  city: 'Los Angeles',
  state: 'CA',
  tee: neutralTee(),
  holes: testHoles(18),
  manualEntry: false,
  ...overrides,
})

/** Par on every hole, so callers can adjust just the holes they care about. */
export const scoresOfPar = (holeCount: 9 | 18 = 18): number[] =>
  PARS.slice(0, holeCount)

/** One over par on every hole: 90 on the full course, 45 on a nine. */
export const scoresOfBogey = (holeCount: 9 | 18 = 18): number[] =>
  PARS.slice(0, holeCount).map((par) => par + 1)

export const holeScores = (strokes: (number | null)[]): HoleScore[] =>
  strokes.map((value, i) => ({
    number: i + 1,
    strokes: value,
    putts: null,
    fairwayHit: null,
    greenInRegulation: null,
  }))

export interface RoundOptions {
  id?: string
  date: string
  strokes?: (number | null)[]
  totalStrokes?: number
  holeCount?: 9 | 18
  nine?: 'front' | 'back'
  course?: CourseSnapshot
}

export function testRound({
  id,
  date,
  strokes,
  totalStrokes,
  holeCount = 18,
  nine,
  course,
}: RoundOptions): Round {
  return {
    id: id ?? `round-${date}`,
    date,
    course: course ?? testCourse({ holes: testHoles(holeCount) }),
    holeCount,
    nine: holeCount === 9 ? (nine ?? 'front') : null,
    holeScores: strokes ? holeScores(strokes) : [],
    totalStrokes: totalStrokes ?? null,
    pcc: 0,
  }
}
