import type { HoleInfo, TeeSet } from '@/domain/whs/types'
import { holesResponseSchema, searchResponseSchema, teesResponseSchema } from './schemas'

export interface CourseSummary {
  id: string
  name: string
  city: string | null
  state: string | null
  par: number | null
  type: string | null
}

export function mapSearchResults(payload: unknown): CourseSummary[] {
  const parsed = searchResponseSchema.parse(payload)
  return parsed.courses.map((course) => ({
    id: course.id,
    name: course.name || course.course_name || 'Unnamed course',
    city: course.city ?? null,
    state: course.state ?? null,
    par: course.par ?? null,
    type: course.type ?? null,
  }))
}

function normaliseGender(value: string | null | undefined): TeeSet['gender'] {
  const lowered = (value ?? '').toLowerCase()
  if (lowered === 'male' || lowered === 'female') return lowered
  return 'unspecified'
}

/**
 * Rated tees only.
 *
 * A tee without a Course Rating and Slope cannot produce a Score Differential,
 * so offering it would silently corrupt the player's index. They are dropped
 * here and the app offers manual entry instead.
 */
export function mapTees(payload: unknown): TeeSet[] {
  const parsed = teesResponseSchema.parse(payload)
  return parsed.tees.flatMap((tee) => {
    if (tee.course_rating == null || tee.slope == null) return []
    return [
      {
        key: tee.tee_key,
        name: tee.tee_name ?? tee.tee_key,
        color: tee.tee_color ?? null,
        gender: normaliseGender(tee.gender),
        courseRating: tee.course_rating,
        slope: tee.slope,
        par: tee.par ?? 72,
        yardage: tee.yardage ?? null,
      },
    ]
  })
}

export interface MappedHoles {
  holes: HoleInfo[]
  /**
   * True when the source had no stroke indexes and hole order was used instead.
   * That only affects which holes the net double bogey cap applies to, but the
   * app tells the player so they can correct it.
   */
  strokeIndexesEstimated: boolean
}

export function mapHoles(payload: unknown): MappedHoles {
  const parsed = holesResponseSchema.parse(payload)
  const sorted = [...parsed.holes].sort((a, b) => a.number - b.number)
  const strokeIndexesEstimated = sorted.some((hole) => hole.handicap_index == null)

  return {
    holes: sorted.map((hole, position) => ({
      number: hole.number,
      par: hole.par ?? 4,
      strokeIndex: hole.handicap_index ?? position + 1,
    })),
    strokeIndexesEstimated,
  }
}
