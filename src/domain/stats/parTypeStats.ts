import type { Round } from '@/domain/whs/types'

/** The par types a scorecard analysis is broken down by. */
export type ParType = 3 | 4 | 5
const PAR_TYPES: ParType[] = [3, 4, 5]

export interface ScoreDistribution {
  eagleOrBetter: number
  birdie: number
  par: number
  bogey: number
  doubleBogey: number
  tripleOrWorse: number
}

export interface ParTypeStats {
  par: ParType
  holesPlayed: number
  averageStrokes: number
  /** Strokes over par per hole. The honest comparison across par types. */
  averageOverPar: number
  /**
   * How this par type compares with the player's own overall scoring.
   * Negative is a strength, positive is a weakness.
   */
  relativeToOverall: number
  distribution: ScoreDistribution
  averagePutts: number | null
  /** Null on par 3s, which have no fairway to hit. */
  fairwayHitRate: number | null
  greenInRegulationRate: number | null
}

export interface ParTypeAnalysis {
  byPar: ParTypeStats[]
  /** The player's strokes over par per hole across every hole played. */
  overallOverPar: number
  strongest: ParType | null
  weakest: ParType | null
}

const round2 = (value: number) => Math.round(value * 100) / 100

const emptyDistribution = (): ScoreDistribution => ({
  eagleOrBetter: 0,
  birdie: 0,
  par: 0,
  bogey: 0,
  doubleBogey: 0,
  tripleOrWorse: 0,
})

function recordScore(distribution: ScoreDistribution, overPar: number): void {
  if (overPar <= -2) distribution.eagleOrBetter++
  else if (overPar === -1) distribution.birdie++
  else if (overPar === 0) distribution.par++
  else if (overPar === 1) distribution.bogey++
  else if (overPar === 2) distribution.doubleBogey++
  else distribution.tripleOrWorse++
}

interface Bucket {
  holes: number
  strokes: number
  overPar: number
  distribution: ScoreDistribution
  putts: number
  holesWithPutts: number
  fairwaysHit: number
  fairwayHoles: number
  greensHit: number
  holesWithGreen: number
}

const emptyBucket = (): Bucket => ({
  holes: 0,
  strokes: 0,
  overPar: 0,
  distribution: emptyDistribution(),
  putts: 0,
  holesWithPutts: 0,
  fairwaysHit: 0,
  fairwayHoles: 0,
  greensHit: 0,
  holesWithGreen: 0,
})

/**
 * Which par types a player scores best and worst on.
 *
 * The headline is strokes over par *per hole*, not per round: a course has far
 * more par 4s than par 3s, so raw totals only measure how often you meet each
 * par type. Each type is then compared against the player's own baseline, so
 * "strongest" means strongest relative to their own game rather than relative
 * to par, which would tell every bogey golfer the same thing.
 *
 * Quick-total rounds are skipped: they carry no hole detail to analyse.
 */
export function parTypeStats(rounds: Round[]): ParTypeAnalysis {
  const buckets = new Map<ParType, Bucket>()
  let totalHoles = 0
  let totalOverPar = 0

  for (const round of rounds) {
    if (round.holeScores.length === 0) continue
    const holesByNumber = new Map(round.course.holes.map((hole) => [hole.number, hole]))

    for (const score of round.holeScores) {
      const hole = holesByNumber.get(score.number)
      if (!hole || score.strokes === null) continue
      if (!PAR_TYPES.includes(hole.par as ParType)) continue

      const par = hole.par as ParType
      const bucket = buckets.get(par) ?? emptyBucket()
      const overPar = score.strokes - par

      bucket.holes++
      bucket.strokes += score.strokes
      bucket.overPar += overPar
      recordScore(bucket.distribution, overPar)

      if (score.putts !== null) {
        bucket.putts += score.putts
        bucket.holesWithPutts++
      }
      if (score.fairwayHit !== null) {
        bucket.fairwayHoles++
        if (score.fairwayHit) bucket.fairwaysHit++
      }
      if (score.greenInRegulation !== null) {
        bucket.holesWithGreen++
        if (score.greenInRegulation) bucket.greensHit++
      }

      buckets.set(par, bucket)
      totalHoles++
      totalOverPar += overPar
    }
  }

  if (totalHoles === 0) {
    return { byPar: [], overallOverPar: 0, strongest: null, weakest: null }
  }

  const overallOverPar = round2(totalOverPar / totalHoles)

  const byPar: ParTypeStats[] = PAR_TYPES.flatMap((par) => {
    const bucket = buckets.get(par)
    if (!bucket || bucket.holes === 0) return []
    const averageOverPar = round2(bucket.overPar / bucket.holes)
    return [
      {
        par,
        holesPlayed: bucket.holes,
        averageStrokes: round2(bucket.strokes / bucket.holes),
        averageOverPar,
        relativeToOverall: round2(averageOverPar - overallOverPar),
        distribution: bucket.distribution,
        averagePutts:
          bucket.holesWithPutts > 0 ? round2(bucket.putts / bucket.holesWithPutts) : null,
        fairwayHitRate:
          bucket.fairwayHoles > 0 ? bucket.fairwaysHit / bucket.fairwayHoles : null,
        greenInRegulationRate:
          bucket.holesWithGreen > 0 ? bucket.greensHit / bucket.holesWithGreen : null,
      },
    ]
  })

  const ranked = [...byPar].sort((a, b) => a.relativeToOverall - b.relativeToOverall)

  return {
    byPar,
    overallOverPar,
    strongest: ranked[0]?.par ?? null,
    weakest: ranked[ranked.length - 1]?.par ?? null,
  }
}
