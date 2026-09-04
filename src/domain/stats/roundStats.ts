import { round1 } from '@/domain/whs/rounding'
import type { ScoringRecord } from '@/domain/whs/scoringRecord'
import type { Round } from '@/domain/whs/types'

export interface SummaryEntry {
  value: number
  roundId: string
  date: string
}

export interface ScoreSummary {
  count: number
  average: number | null
  /** The lowest value, which is always the best in golf. */
  best: SummaryEntry | null
  worst: SummaryEntry | null
}

const emptySummary = (): ScoreSummary => ({
  count: 0,
  average: null,
  best: null,
  worst: null,
})

function summarise(entries: SummaryEntry[]): ScoreSummary {
  if (entries.length === 0) return emptySummary()
  const total = entries.reduce((sum, entry) => sum + entry.value, 0)
  const sorted = [...entries].sort((a, b) => a.value - b.value)
  return {
    count: entries.length,
    average: round1(total / entries.length),
    best: sorted[0]!,
    worst: sorted[sorted.length - 1]!,
  }
}

function grossScoreOf(round: Round): number | null {
  if (round.holeScores.length > 0) {
    const played = round.holeScores.filter((hole) => hole.strokes !== null)
    if (played.length === 0) return null
    return played.reduce((total, hole) => total + (hole.strokes ?? 0), 0)
  }
  return round.totalStrokes
}

/**
 * Average, best and worst gross score.
 *
 * Nine and eighteen hole rounds are summarised separately, since a 45 and a 90
 * are not comparable numbers.
 */
export function scoreSummary(rounds: Round[], holeCount: 9 | 18): ScoreSummary {
  const entries = rounds.flatMap((round) => {
    if (round.holeCount !== holeCount) return []
    const gross = grossScoreOf(round)
    return gross === null ? [] : [{ value: gross, roundId: round.id, date: round.date }]
  })
  return summarise(entries)
}

/**
 * Average, best and worst *round*, ranked by Score Differential.
 *
 * This is the ranking that actually means something: a 78 at Bethpage Black is
 * a far better round than a 78 at an easy muni, and only the differential says so.
 */
export function differentialSummary(record: ScoringRecord): ScoreSummary {
  return summarise(
    record.differentials.map((differential) => ({
      value: differential.value,
      roundId: differential.roundId,
      date: differential.date,
    })),
  )
}

export interface CoursePerformance {
  courseId: string
  courseName: string
  roundsPlayed: number
  averageDifferential: number
  bestDifferential: number
  worstDifferential: number
}

/** How a player scores at each course they have played, best average first. */
export function coursePerformance(
  record: ScoringRecord,
  rounds: Round[],
): CoursePerformance[] {
  const roundsById = new Map(rounds.map((round) => [round.id, round]))
  const byCourse = new Map<string, { name: string; values: number[] }>()

  for (const differential of record.differentials) {
    const round = roundsById.get(differential.roundId)
    if (!round) continue
    const entry = byCourse.get(round.course.id) ?? { name: round.course.name, values: [] }
    entry.values.push(differential.value)
    byCourse.set(round.course.id, entry)
  }

  return [...byCourse.entries()]
    .map(([courseId, { name, values }]) => ({
      courseId,
      courseName: name,
      roundsPlayed: values.length,
      averageDifferential: round1(values.reduce((a, b) => a + b, 0) / values.length),
      bestDifferential: Math.min(...values),
      worstDifferential: Math.max(...values),
    }))
    .sort((a, b) => a.averageDifferential - b.averageDifferential)
}

export interface ShotStats {
  roundsWithPutts: number
  /** Putts per round, over the rounds that recorded them. */
  averagePutts: number | null
  fairwayHoles: number
  fairwaysHit: number
  fairwayHitRate: number | null
  holesWithGreenRecorded: number
  greensInRegulation: number
  greenInRegulationRate: number | null
}

/**
 * Putting, driving accuracy and greens in regulation across every round that
 * recorded them. These are what explain the par-type breakdown.
 */
export function shotStats(rounds: Round[]): ShotStats {
  let totalPutts = 0
  let roundsWithPutts = 0
  let fairwayHoles = 0
  let fairwaysHit = 0
  let holesWithGreenRecorded = 0
  let greensInRegulation = 0

  for (const round of rounds) {
    let roundPutts = 0
    let roundRecordedPutts = false

    for (const hole of round.holeScores) {
      if (hole.putts !== null) {
        roundPutts += hole.putts
        roundRecordedPutts = true
      }
      if (hole.fairwayHit !== null) {
        fairwayHoles++
        if (hole.fairwayHit) fairwaysHit++
      }
      if (hole.greenInRegulation !== null) {
        holesWithGreenRecorded++
        if (hole.greenInRegulation) greensInRegulation++
      }
    }

    if (roundRecordedPutts) {
      totalPutts += roundPutts
      roundsWithPutts++
    }
  }

  return {
    roundsWithPutts,
    averagePutts: roundsWithPutts > 0 ? round1(totalPutts / roundsWithPutts) : null,
    fairwayHoles,
    fairwaysHit,
    fairwayHitRate: fairwayHoles > 0 ? fairwaysHit / fairwayHoles : null,
    holesWithGreenRecorded,
    greensInRegulation,
    greenInRegulationRate:
      holesWithGreenRecorded > 0 ? greensInRegulation / holesWithGreenRecorded : null,
  }
}
