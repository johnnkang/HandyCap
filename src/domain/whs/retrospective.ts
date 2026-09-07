import {
  averageOfLowest,
  differentialsUsed,
  SCORING_RECORD_SIZE,
  type DifferentialSelection,
} from './handicapIndex'
import {
  activeReduction,
  buildScoringRecord,
  reducedValues,
  type CapStatus,
  type PendingNine,
  type PostedDifferential,
  type ScoringRecord,
} from './scoringRecord'
import { round1, toTenths } from './rounding'
import type { Round } from './types'

/** The Rule 5.2a row in force, with the record size that selected it. */
export interface SelectionRow extends DifferentialSelection {
  scoreCount: number
}

export type MovementKind =
  /** There was no index before and there is one now. */
  | 'first'
  /** There was an index and a deletion took it away. */
  | 'lost'
  /** There is still no index. */
  | 'notYet'
  | 'up'
  | 'down'
  | 'steady'

export interface IndexMovement {
  before: number | null
  after: number | null
  /** `after - before`. Null unless both sides have an index. */
  strokes: number | null
  kind: MovementKind
}

/**
 * One reason the Handicap Index moved, and what it was worth.
 *
 * `strokes` is signed the way the index moves, so negative is an improvement.
 * A cause worth exactly 0 is still reported: "your round joined the record and
 * changed nothing" is the answer to a question players ask constantly, and
 * silence reads as the app having lost the round.
 */
export type IndexChangeCause =
  /** A differential joined the 20-score window. */
  | { kind: 'entered'; strokes: number; differential: PostedDifferential }
  /** A differential left the window because twenty newer scores sit ahead of it. */
  | { kind: 'agedOut'; strokes: number; differential: PostedDifferential }
  /** A differential left because its round was removed from the record. */
  | { kind: 'deleted'; strokes: number; differential: PostedDifferential }
  /**
   * A differential already in the window was re-derived. Happens when a
   * backdated round changes the Course Handicap held at a later round, which
   * changes the net double bogey cap that round was adjusted under.
   */
  | { kind: 'revised'; strokes: number; roundId: string; date: string; from: number; to: number }
  /** The record crossed a Rule 5.2a threshold, so a different row applies. */
  | { kind: 'selection'; strokes: number; from: SelectionRow; to: SelectionRow }
  /** Rule 5.9 reductions active in the window changed — one applied, or one faded. */
  | { kind: 'exceptionalScore'; strokes: number; from: number; to: number }
  /** Rule 5.6 caps, or the Low Handicap Index they are measured against. */
  | {
      kind: 'cap'
      strokes: number
      from: CapStatus
      to: CapStatus
      lowHandicapIndexBefore: number | null
      lowHandicapIndexAfter: number | null
    }

/**
 * Which rounds the index is drawn from, and how that set moved.
 *
 * A description rather than a cause: the counting set changing is the
 * *mechanism* by which entries, exits and revisions move the number, never an
 * independent reason of its own.
 */
export interface CountingSetChange {
  startedCounting: string[]
  stoppedCounting: string[]
  /**
   * True when the differential at the selection boundary is duplicated, so
   * which round counts is arbitrary and any swap is worth nothing.
   */
  tiedAtBoundary: boolean
}

export interface IndexRetrospective {
  movement: IndexMovement
  /** The causes that fired, in the order applied. Sums exactly to the movement. */
  causes: IndexChangeCause[]
  /** The largest-magnitude cause, earliest on ties. Null when nothing moved. */
  principalCause: IndexChangeCause | null
  countingSet: CountingSetChange
  /** A nine now waiting for a partner, which is why nothing happened. */
  pendingNine: PendingNine | null
}

const windowOf = (record: ScoringRecord): PostedDifferential[] =>
  record.differentials.slice(-SCORING_RECORD_SIZE)

const rowFor = (scoreCount: number): SelectionRow => ({
  ...differentialsUsed(scoreCount),
  scoreCount,
})

const sameRow = (a: SelectionRow, b: SelectionRow) =>
  a.count === b.count && a.adjustment === b.adjustment

/** The uncapped index a set of differentials produces under a given row. */
const evaluate = (
  entries: PostedDifferential[],
  selection: DifferentialSelection,
  reduction: number,
): number => round1(averageOfLowest(reducedValues(entries, reduction), selection))

function movementOf(before: ScoringRecord, after: ScoringRecord): IndexMovement {
  const from = before.index
  const to = after.index

  if (from === null && to === null) return { before: null, after: null, strokes: null, kind: 'notYet' }
  if (from === null) return { before: null, after: to, strokes: null, kind: 'first' }
  if (to === null) return { before: from, after: null, strokes: null, kind: 'lost' }

  const strokes = round1(to - from)
  return {
    before: from,
    after: to,
    strokes,
    kind: strokes < 0 ? 'down' : strokes > 0 ? 'up' : 'steady',
  }
}

function countingSetChange(
  before: ScoringRecord,
  after: ScoringRecord,
): CountingSetChange {
  const wasCounting = new Set(before.countingRoundIds)
  const isCounting = new Set(after.countingRoundIds)
  const afterWindow = new Set(windowOf(after).map((entry) => entry.roundId))

  return {
    startedCounting: after.countingRoundIds.filter((id) => !wasCounting.has(id)),
    // A round that left the window did not "stop counting" — it expired. The
    // distinction matters, because the prose for the two is not the same.
    stoppedCounting: before.countingRoundIds.filter(
      (id) => !isCounting.has(id) && afterWindow.has(id),
    ),
    tiedAtBoundary: boundaryIsTied(after),
  }
}

function boundaryIsTied(record: ScoringRecord): boolean {
  const window = windowOf(record)
  const { count } = differentialsUsed(window.length)
  if (count <= 0 || count > window.length) return false

  const sorted = reducedValues(window, activeReduction(window))
    .map(toTenths)
    .sort((a, b) => a - b)
  const boundary = sorted[count - 1]!
  return sorted.filter((value) => value === boundary).length > 1
}

/**
 * Why the Handicap Index differs between two states of a scoring record.
 *
 * Attribution walks a fixed chain of intermediate states, each differing from
 * the last by exactly one cause, and evaluates the index at every step. The
 * index is not a sum of independent terms — it is an average of a selected
 * subset, then capped — so the only honest way to say what a cause was worth is
 * to hold everything else still and look.
 *
 * The chain is deliberately ordered as a player experiences it: what happened
 * to the scores first, then the rules that read them. It is not commutative,
 * and the caps come last as a residual, which is what makes the parts sum to
 * the whole exactly rather than approximately.
 *
 * Taking two whole records rather than watching one being built is what lets
 * this describe a deletion, a whole-record import, and a backdated round that
 * silently re-derives scores posted long ago.
 */
export function explainIndexChange(
  before: ScoringRecord,
  after: ScoringRecord,
): IndexRetrospective {
  const movement = movementOf(before, after)
  const countingSet = countingSetChange(before, after)

  // Contributions are only meaningful when there is an index on both sides;
  // inventing them for an arrival or a loss would be arithmetic theatre.
  if (movement.strokes === null || before.index === null || after.index === null) {
    return {
      movement,
      causes: [],
      principalCause: null,
      countingSet,
      pendingNine: after.pendingNine,
    }
  }

  const windowBefore = windowOf(before)
  const windowAfter = windowOf(after)
  const rowBefore = rowFor(windowBefore.length)
  const rowAfter = rowFor(windowAfter.length)
  const reductionBefore = activeReduction(windowBefore)
  const reductionAfter = activeReduction(windowAfter)

  const causes: IndexChangeCause[] = []
  let entries = [...windowBefore]
  let selection: DifferentialSelection = rowBefore
  let reduction = reductionBefore
  let current = evaluate(entries, selection, reduction)

  /** Move one link along the chain and record what that link was worth. */
  const advance = (
    next: {
      entries?: PostedDifferential[]
      selection?: DifferentialSelection
      reduction?: number
    },
    make: (strokes: number) => IndexChangeCause,
  ) => {
    entries = next.entries ?? entries
    selection = next.selection ?? selection
    reduction = next.reduction ?? reduction
    const evaluated = evaluate(entries, selection, reduction)
    const strokes = round1(evaluated - current)
    current = evaluated
    causes.push(make(strokes))
  }

  const beforeById = new Map(windowBefore.map((entry) => [entry.roundId, entry]))
  const afterById = new Map(windowAfter.map((entry) => [entry.roundId, entry]))
  const survivesInAfter = new Set(after.differentials.map((entry) => entry.roundId))

  // 1. Differentials still present but re-derived.
  for (const entry of windowAfter) {
    const previous = beforeById.get(entry.roundId)
    if (!previous || toTenths(previous.value) === toTenths(entry.value)) continue
    advance(
      { entries: entries.map((held) => (held.roundId === entry.roundId ? entry : held)) },
      (strokes) => ({
        kind: 'revised',
        strokes,
        roundId: entry.roundId,
        date: entry.date,
        from: previous.value,
        to: entry.value,
      }),
    )
  }

  // 2. Differentials that joined the window.
  for (const entry of windowAfter) {
    if (beforeById.has(entry.roundId)) continue
    advance({ entries: [...entries, entry] }, (strokes) => ({
      kind: 'entered',
      strokes,
      differential: entry,
    }))
  }

  // 3. Differentials that left it, either by expiring or by being removed.
  for (const entry of windowBefore) {
    if (afterById.has(entry.roundId)) continue
    advance(
      { entries: entries.filter((held) => held.roundId !== entry.roundId) },
      (strokes) => ({
        kind: survivesInAfter.has(entry.roundId) ? 'agedOut' : 'deleted',
        strokes,
        differential: entry,
      }),
    )
  }

  // 4. The Rule 5.2a row the new record size selects.
  if (!sameRow(rowBefore, rowAfter)) {
    advance({ selection: rowAfter }, (strokes) => ({
      kind: 'selection',
      strokes,
      from: rowBefore,
      to: rowAfter,
    }))
  }

  // 5. Rule 5.9 reductions active across the window.
  if (toTenths(reductionBefore) !== toTenths(reductionAfter)) {
    advance({ reduction: reductionAfter }, (strokes) => ({
      kind: 'exceptionalScore',
      strokes,
      from: reductionBefore,
      to: reductionAfter,
    }))
  }

  // 6. The caps, as a residual. Computing what is left over rather than
  //    modelling it makes the causes sum to the movement by construction.
  const capStrokes = round1(after.index - current - (before.index - evaluate(windowBefore, rowBefore, reductionBefore)))
  if (toTenths(capStrokes) !== 0 || before.cap !== after.cap) {
    causes.push({
      kind: 'cap',
      strokes: capStrokes,
      from: before.cap,
      to: after.cap,
      lowHandicapIndexBefore: before.lowHandicapIndex,
      lowHandicapIndexAfter: after.lowHandicapIndex,
    })
  }

  return {
    movement,
    causes,
    principalCause: principalOf(causes),
    countingSet,
    pendingNine: after.pendingNine,
  }
}

function principalOf(causes: IndexChangeCause[]): IndexChangeCause | null {
  let best: IndexChangeCause | null = null
  for (const cause of causes) {
    if (toTenths(cause.strokes) === 0) continue
    if (best === null || Math.abs(toTenths(cause.strokes)) > Math.abs(toTenths(best.strokes))) {
      best = cause
    }
  }
  return best
}

/**
 * Why the index is where it is, given that `roundId` was posted.
 *
 * For the newest round this reads as "why your Index moved". For an older one
 * it is "what this round is still worth to you", which is the same computation
 * and only a sentence of prose apart.
 */
export function explainRoundPosted(rounds: Round[], roundId: string): IndexRetrospective {
  return explainIndexChange(
    buildScoringRecord(rounds.filter((round) => round.id !== roundId)),
    buildScoringRecord(rounds),
  )
}

export interface TimelineEntry {
  roundId: string
  date: string
  retrospective: IndexRetrospective
}

/**
 * Every movement the Handicap Index has made, oldest first.
 *
 * Built by walking the record forward one round at a time and comparing each
 * prefix with the one before it. That is deliberately not the same as asking
 * what each round is worth today: this is the history as the player lived it,
 * so a round posted last week cannot rewrite the story of one from March.
 *
 * Rounds that produced no index — the first two, and a nine still waiting for a
 * partner — have no entry, because there is nothing yet to tell.
 */
export function indexTimeline(rounds: Round[]): TimelineEntry[] {
  const chronological = [...rounds].sort((a, b) => a.date.localeCompare(b.date))
  const entries: TimelineEntry[] = []

  let previous = buildScoringRecord([])
  for (let count = 1; count <= chronological.length; count++) {
    const round = chronological[count - 1]!
    const current = buildScoringRecord(chronological.slice(0, count))

    if (current.index !== null) {
      entries.push({
        roundId: round.id,
        date: round.date,
        retrospective: explainIndexChange(previous, current),
      })
    }
    previous = current
  }

  return entries
}
