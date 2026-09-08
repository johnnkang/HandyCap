import type { Round } from '@/domain/whs/types'
import { type SyncState, type SyncedRound, type Tombstone } from './types'

/** What one side claims about a round id: it exists as of a time, or it was deleted at one. */
type Claim =
  | { kind: 'round'; at: string; round: Round }
  | { kind: 'tombstone'; at: string }

/**
 * The later claim wins.
 *
 * Ties are broken deterministically so the merge stays commutative: a deletion
 * beats a write at the same instant (a round staying deleted is a better
 * failure than one silently reappearing), and two writes at the same instant
 * fall back to comparing their serialised content.
 */
function later(a: Claim, b: Claim): Claim {
  if (a.at !== b.at) return a.at > b.at ? a : b
  if (a.kind !== b.kind) return a.kind === 'tombstone' ? a : b
  if (a.kind === 'tombstone' || b.kind === 'tombstone') return a
  return JSON.stringify(a.round) >= JSON.stringify(b.round) ? a : b
}

/**
 * Last-write-wins per round, with deletions as first-class citizens.
 *
 * Total, pure, and — because `later` is a maximum under a total order —
 * commutative, idempotent and associative. Those three properties are what let
 * any number of devices converge regardless of the order they sync in, and
 * they are pinned by property tests in `merge.properties.test.ts`.
 */
export function mergeStates(local: SyncState, remote: SyncState): SyncState {
  const winners = new Map<string, Claim>()

  const offer = (id: string, claim: Claim) => {
    const held = winners.get(id)
    winners.set(id, held ? later(held, claim) : claim)
  }

  for (const side of [local, remote]) {
    for (const { round, updatedAt } of side.rounds) {
      offer(round.id, { kind: 'round', at: updatedAt, round })
    }
    for (const { id, deletedAt } of side.tombstones) {
      offer(id, { kind: 'tombstone', at: deletedAt })
    }
  }

  const rounds: SyncedRound[] = []
  const tombstones: Tombstone[] = []
  for (const [id, winner] of winners) {
    if (winner.kind === 'round') rounds.push({ round: winner.round, updatedAt: winner.at })
    else tombstones.push({ id, deletedAt: winner.at })
  }

  // Sorted so the output is a deterministic value, which is what lets the
  // property tests assert equality between differently-ordered merges.
  rounds.sort(
    (a, b) =>
      a.round.date.localeCompare(b.round.date) || a.round.id.localeCompare(b.round.id),
  )
  tombstones.sort((a, b) => a.id.localeCompare(b.id))

  return { rounds, tombstones }
}
