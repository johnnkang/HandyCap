/**
 * Reconciles HandyCap's engine against a real, official GHIN Handicap Index.
 *
 * This is the one check the rest of the suite cannot do. Every other test
 * asserts that the engine matches *our reading* of the Rules of Handicapping;
 * this one asserts that our reading is right, against the body that publishes
 * them.
 *
 * It is inert until real data exists. Copy `ghin-data.example.json` to
 * `ghin-data.json` (gitignored — it is personal data) and fill it in from a
 * GHIN score history. Then `npm test` reconciles it and prints a per-round
 * table showing exactly where any gap comes from.
 *
 * One thing to get right when filling it in: the score GHIN displays is the
 * *adjusted* gross score, already capped at net double bogey when it was
 * posted. So these rounds are built without hole detail, which tells the engine
 * to take the total as given rather than capping it a second time.
 */
import { describe, expect, test } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildScoringRecord } from './scoringRecord'
import type { CourseSnapshot, HoleInfo, Round } from './types'

interface GhinRound {
  date: string
  course: string
  tee: string
  /** Adjusted gross score, as GHIN displays it. */
  score: number
  courseRating: number
  slope: number
  par?: number
  holes?: 9 | 18
  nine?: 'front' | 'back'
  /** GHIN's own Score Differential for this round, when it is shown. */
  ghinDifferential?: number
}

interface GhinData {
  officialIndex: number
  asOf?: string
  rounds: GhinRound[]
}

// Resolved from the project root: Vite rewrites `import.meta.url` to a
// non-file scheme, so it cannot be used to locate a file on disk here.
const dataPath = resolve(process.cwd(), 'ghin-data.json')

/**
 * Filler hole pars summing to the course's par. Quick-total rounds never read
 * these — the net double bogey cap needs hole detail, which GHIN scores do not
 * carry — but `CourseSnapshot` requires the shape.
 */
function fillerHoles(par: number, holeCount: 9 | 18): HoleInfo[] {
  const base = Math.floor(par / holeCount)
  let remainder = par - base * holeCount
  return Array.from({ length: holeCount }, (_, i) => {
    const extra = remainder > 0 ? 1 : 0
    remainder -= extra
    return { number: i + 1, par: base + extra, strokeIndex: i + 1 }
  })
}

function toRound(entry: GhinRound, i: number): Round {
  const holeCount = entry.holes ?? 18
  const par = entry.par ?? 72
  const course: CourseSnapshot = {
    id: `${entry.course}-${entry.tee}`,
    name: entry.course,
    city: null,
    state: null,
    tee: {
      key: entry.tee,
      name: entry.tee,
      color: null,
      gender: 'unspecified',
      courseRating: entry.courseRating,
      slope: entry.slope,
      par,
      yardage: null,
    },
    holes: fillerHoles(par, holeCount),
    manualEntry: true,
  }
  return {
    id: `ghin-${i}-${entry.date}`,
    date: entry.date,
    course,
    holeCount,
    nine: holeCount === 9 ? (entry.nine ?? 'front') : null,
    // Empty: GHIN scores are already adjusted, so do not re-cap them.
    holeScores: [],
    totalStrokes: entry.score,
    pcc: 0,
  }
}

const hasData = existsSync(dataPath)

describe.skipIf(!hasData)('reconciliation against a real GHIN index', () => {
  const data: GhinData = hasData
    ? JSON.parse(readFileSync(dataPath, 'utf8'))
    : { officialIndex: 0, rounds: [] }

  test('every round matches the Score Differential GHIN published', () => {
    const record = buildScoringRecord(data.rounds.map(toRound))

    const rows = data.rounds
      .map((entry, i) => {
        const posted = record.differentials.find((d) => d.roundId === `ghin-${i}-${entry.date}`)
        return { entry, ours: posted?.value ?? null }
      })
      .filter((row) => row.entry.ghinDifferential !== undefined)

    const mismatches = rows.filter(
      (row) => row.ours === null || Math.abs(row.ours - row.entry.ghinDifferential!) > 0.05,
    )

    if (mismatches.length > 0) {
      const table = mismatches
        .map((row) => {
          const ours = row.ours === null ? 'none (pending nine?)' : row.ours.toFixed(1)
          const delta = row.ours === null ? '' : ` delta ${(row.ours - row.entry.ghinDifferential!).toFixed(1)}`
          return `  ${row.entry.date}  ${row.entry.course} (${row.entry.tee})  score ${row.entry.score}  CR ${row.entry.courseRating}/${row.entry.slope}  GHIN ${row.entry.ghinDifferential!.toFixed(1)}  ours ${ours}${delta}`
        })
        .join('\n')
      throw new Error(
        `${mismatches.length} of ${rows.length} differentials disagree with GHIN:\n${table}`,
      )
    }
    expect(mismatches).toHaveLength(0)
  })

  test('the Handicap Index matches the official one', () => {
    const record = buildScoringRecord(data.rounds.map(toRound))

    if (record.index === null) {
      throw new Error(
        `No index: only ${record.differentials.length} differentials, ${record.scoresNeeded} more needed.`,
      )
    }

    const delta = record.index - data.officialIndex
    if (Math.abs(delta) > 0.05) {
      const counting = new Set(record.countingRoundIds)
      const table = record.differentials
        .map(
          (d) =>
            `  ${d.date}  diff ${d.value.toFixed(1)}${counting.has(d.roundId) ? '  <- counted' : ''}`,
        )
        .join('\n')
      throw new Error(
        `Index mismatch: ours ${record.index.toFixed(1)}, GHIN ${data.officialIndex.toFixed(1)}, delta ${delta.toFixed(1)}.\n` +
          `${record.differentials.length} differentials, low index ${record.lowHandicapIndex ?? 'none'}, cap ${record.cap}.\n${table}`,
      )
    }
    expect(record.index).toBeCloseTo(data.officialIndex, 1)
  })
})
