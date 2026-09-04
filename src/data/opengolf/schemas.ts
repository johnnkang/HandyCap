import { z } from 'zod'

/**
 * Schemas for the OpenGolfAPI responses HandyCap depends on.
 *
 * The data is community-sourced, so nearly every field can come back null.
 * Parsing leniently here and repairing in `map.ts` keeps that mess out of the
 * domain layer, which assumes complete, valid courses.
 */

export const courseSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  course_name: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  type: z.string().nullish(),
  par: z.number().nullish(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
})

// The array itself is required: a response missing it entirely means the
// service is broken, and must not be reported to the player as "no results".
export const searchResponseSchema = z.object({
  courses: z.array(courseSummarySchema),
  total: z.number().nullish(),
})

export const teeSchema = z.object({
  tee_key: z.string(),
  tee_name: z.string().nullish(),
  tee_color: z.string().nullish(),
  gender: z.string().nullish(),
  course_rating: z.number().nullish(),
  slope: z.number().nullish(),
  par: z.number().nullish(),
  yardage: z.number().nullish(),
})

export const teesResponseSchema = z.object({
  tees: z.array(teeSchema),
})

export const holeSchema = z.object({
  number: z.number(),
  par: z.number().nullish(),
  handicap_index: z.number().nullish(),
})

export const holesResponseSchema = z.object({
  holes: z.array(holeSchema),
})

export type SearchResponse = z.infer<typeof searchResponseSchema>
export type TeesResponse = z.infer<typeof teesResponseSchema>
export type HolesResponse = z.infer<typeof holesResponseSchema>
