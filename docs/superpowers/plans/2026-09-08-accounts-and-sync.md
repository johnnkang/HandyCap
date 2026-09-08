# Optional Accounts and Cross-Device Sync — Implementation Plan (Part 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship working cross-device sync for HandyCap behind an optional account, with magic-link sign-in, while guest mode stays the fully-offline default.

**Architecture:** Sync metadata lives in a data-layer envelope (`SyncedRound`, `Tombstone`) so `src/domain/` stays pure and `Round` is untouched. Conflicts resolve through one pure, total function — `mergeStates(local, remote)` — using last-write-wins per round with deletions as first-class tombstones. Everything network-facing sits behind an interface with an in-memory fake, so no test touches Supabase.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest 5, IndexedDB via `idb-keyval`, Supabase (`@supabase/supabase-js` v2.105+), Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-09-08-optional-accounts-and-sync-design.md`

**Scope note:** This plan covers spec build steps 1–4 and 7. Passkeys and email+password (steps 5–6) are Part 2, written after this ships. The spec states magic link alone is a complete, shippable product.

## Global Constraints

- **`src/domain/` stays pure.** No React, no network, no ambient clock, no sync metadata. `Round` in `src/domain/whs/types.ts` is not modified by any task in this plan.
- **Guest mode is not a trial.** No task may gate an existing feature behind an account, add a blocking modal, or degrade the unauthenticated experience.
- **All timestamps are ISO-8601 UTC strings produced by `new Date().toISOString()`.** The merge compares them lexicographically, so format consistency is a correctness requirement, not a style choice. Postgres columns holding them are `text`, never `timestamptz`.
- **No test may touch the network or a real Supabase project.** Use the in-memory fakes.
- **Clocks are injected, never ambient.** Any function needing the time takes a `now: () => string` parameter defaulting to `() => new Date().toISOString()`.
- **Path alias:** `@/` resolves to `src/` (configured in `vite.config.ts`).
- **Test commands:** `npm test` runs everything; `npx vitest run <path>` runs one file.
- **Existing suite is 241 tests and must stay green.** The app-facing `Repository` interface keeps its current methods with their current behaviour, so existing UI tests are unaffected.
- **Supabase client is dynamically imported** (the pattern `src/data/repo/store.ts` already uses for `idb-keyval`), so guests never download auth code.

---

### Task 1: Sync types and the merge function

**Files:**
- Create: `src/data/sync/types.ts`
- Create: `src/data/sync/merge.ts`
- Test: `src/data/sync/merge.test.ts`

**Interfaces:**
- Consumes: `Round` from `@/domain/whs/types`; `testRound` from `@/test/fixtures`.
- Produces: `SyncedRound`, `Tombstone`, `SyncState`, `emptySyncState()`, `mergeStates(local: SyncState, remote: SyncState): SyncState`.

- [ ] **Step 1: Write the failing tests**

Create `src/data/sync/merge.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { testRound } from '@/test/fixtures'
import { mergeStates } from './merge'
import { emptySyncState, type SyncState } from './types'

const at = (id: string, date: string, updatedAt: string, totalStrokes = 90) => ({
  round: testRound({ id, date, totalStrokes }),
  updatedAt,
})

const state = (partial: Partial<SyncState>): SyncState => ({ ...emptySyncState(), ...partial })

describe('mergeStates', () => {
  test('keeps rounds that only one side has', () => {
    const local = state({ rounds: [at('a', '2026-05-01', '2026-05-01T00:00:00.000Z')] })
    const remote = state({ rounds: [at('b', '2026-05-02', '2026-05-02T00:00:00.000Z')] })
    expect(mergeStates(local, remote).rounds.map((r) => r.round.id)).toEqual(['a', 'b'])
  })

  test('the later write wins for the same round', () => {
    const local = state({ rounds: [at('a', '2026-05-01', '2026-05-01T00:00:00.000Z', 90)] })
    const remote = state({ rounds: [at('a', '2026-05-01', '2026-05-03T00:00:00.000Z', 84)] })
    const merged = mergeStates(local, remote)
    expect(merged.rounds).toHaveLength(1)
    expect(merged.rounds[0]!.round.totalStrokes).toBe(84)
  })

  test('a delete newer than the write removes the round', () => {
    const local = state({ rounds: [at('a', '2026-05-01', '2026-05-01T00:00:00.000Z')] })
    const remote = state({ tombstones: [{ id: 'a', deletedAt: '2026-05-02T00:00:00.000Z' }] })
    const merged = mergeStates(local, remote)
    expect(merged.rounds).toEqual([])
    expect(merged.tombstones).toEqual([{ id: 'a', deletedAt: '2026-05-02T00:00:00.000Z' }])
  })

  test('a write newer than the delete brings the round back', () => {
    const local = state({ tombstones: [{ id: 'a', deletedAt: '2026-05-01T00:00:00.000Z' }] })
    const remote = state({ rounds: [at('a', '2026-05-01', '2026-05-02T00:00:00.000Z')] })
    expect(mergeStates(local, remote).rounds.map((r) => r.round.id)).toEqual(['a'])
  })

  test('a tie prefers the deletion, because resurrection is the worse failure', () => {
    const same = '2026-05-01T00:00:00.000Z'
    const local = state({ rounds: [at('a', '2026-05-01', same)] })
    const remote = state({ tombstones: [{ id: 'a', deletedAt: same }] })
    expect(mergeStates(local, remote).rounds).toEqual([])
  })

  test('keeps the tombstone so a later sync cannot resurrect the round', () => {
    const local = state({ tombstones: [{ id: 'a', deletedAt: '2026-05-02T00:00:00.000Z' }] })
    const merged = mergeStates(local, emptySyncState())
    const again = mergeStates(merged, state({ rounds: [at('a', '2026-05-01', '2026-05-01T00:00:00.000Z')] }))
    expect(again.rounds).toEqual([])
  })

  test('orders rounds by date then id, so output is deterministic', () => {
    const local = state({
      rounds: [
        at('z', '2026-05-09', '2026-05-09T00:00:00.000Z'),
        at('a', '2026-05-01', '2026-05-01T00:00:00.000Z'),
      ],
    })
    expect(mergeStates(local, emptySyncState()).rounds.map((r) => r.round.id)).toEqual(['a', 'z'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/data/sync/merge.test.ts`
Expected: FAIL — cannot resolve `./merge` or `./types`.

- [ ] **Step 3: Write the types**

Create `src/data/sync/types.ts`:

```ts
/**
 * The persistence envelope around a round.
 *
 * `updatedAt` and deletions are sync bookkeeping, not World Handicap System
 * properties, so they live here rather than on `Round` — `src/domain/` must
 * stay pure and must not learn that sync exists.
 */
import type { Round } from '@/domain/whs/types'

export interface SyncedRound {
  round: Round
  /** ISO-8601 UTC. When this round was last written, on any device. */
  updatedAt: string
}

/**
 * A remembered deletion. Without these, a round deleted on one device is
 * resurrected by another on the next sync.
 */
export interface Tombstone {
  id: string
  /** ISO-8601 UTC. */
  deletedAt: string
}

export interface SyncState {
  rounds: SyncedRound[]
  tombstones: Tombstone[]
}

export const emptySyncState = (): SyncState => ({ rounds: [], tombstones: [] })
```

- [ ] **Step 4: Write the merge**

Create `src/data/sync/merge.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/data/sync/merge.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/data/sync/types.ts src/data/sync/merge.ts src/data/sync/merge.test.ts
git commit -m "Resolve round conflicts with last-write-wins and tombstones"
```

---

### Task 2: Property tests pinning convergence

The merge is the one piece where a subtle bug silently loses a user's rounds. These three properties are what actually guarantee devices converge; the examples in Task 1 only check the cases we thought of.

**Files:**
- Test: `src/data/sync/merge.properties.test.ts`

**Interfaces:**
- Consumes: `mergeStates`, `SyncState`, `emptySyncState` from Task 1.
- Produces: nothing — tests only.

- [ ] **Step 1: Write the property tests**

Create `src/data/sync/merge.properties.test.ts`:

```ts
/**
 * Convergence properties of the merge.
 *
 * Seeded so a failure is reproducible. The generator deliberately produces
 * colliding ids and timestamps across the three states, because that is where
 * tie-breaking has to hold.
 */
import { describe, expect, test } from 'vitest'
import { testRound } from '@/test/fixtures'
import { mergeStates } from './merge'
import type { SyncState } from './types'

/** Deterministic PRNG (mulberry32), so a failing case can be reproduced. */
function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAYS = ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04']
const STAMPS = [
  '2026-05-01T00:00:00.000Z',
  '2026-05-02T00:00:00.000Z',
  '2026-05-03T00:00:00.000Z',
]

function randomState(rand: () => number): SyncState {
  const state: SyncState = { rounds: [], tombstones: [] }
  const count = Math.floor(rand() * 6)
  for (let i = 0; i < count; i++) {
    const id = `r${Math.floor(rand() * 5)}`
    const at = STAMPS[Math.floor(rand() * STAMPS.length)]!
    if (rand() < 0.3) {
      state.tombstones.push({ id, deletedAt: at })
    } else {
      state.rounds.push({
        round: testRound({
          id,
          date: DAYS[Math.floor(rand() * DAYS.length)]!,
          totalStrokes: 80 + Math.floor(rand() * 20),
        }),
        updatedAt: at,
      })
    }
  }
  return state
}

describe('merge convergence', () => {
  test('is commutative: which device syncs first cannot matter', () => {
    const rand = seeded(1)
    for (let i = 0; i < 400; i++) {
      const a = randomState(rand)
      const b = randomState(rand)
      expect(mergeStates(a, b)).toEqual(mergeStates(b, a))
    }
  })

  test('is idempotent: syncing twice changes nothing', () => {
    const rand = seeded(2)
    for (let i = 0; i < 400; i++) {
      const a = randomState(rand)
      const b = randomState(rand)
      const once = mergeStates(a, b)
      expect(mergeStates(once, b)).toEqual(once)
      expect(mergeStates(once, once)).toEqual(once)
    }
  })

  test('is associative: three devices converge however they pair up', () => {
    const rand = seeded(3)
    for (let i = 0; i < 400; i++) {
      const a = randomState(rand)
      const b = randomState(rand)
      const c = randomState(rand)
      expect(mergeStates(mergeStates(a, b), c)).toEqual(mergeStates(a, mergeStates(b, c)))
    }
  })

  test('never drops a round without a tombstone to explain it', () => {
    const rand = seeded(4)
    for (let i = 0; i < 400; i++) {
      const a = randomState(rand)
      const b = randomState(rand)
      const merged = mergeStates(a, b)
      const surviving = new Set(merged.rounds.map((r) => r.round.id))
      const deleted = new Set(merged.tombstones.map((t) => t.id))
      for (const side of [a, b]) {
        for (const { round } of side.rounds) {
          expect(surviving.has(round.id) || deleted.has(round.id)).toBe(true)
        }
      }
    }
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/data/sync/merge.properties.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 3: Verify the tests actually bite**

Temporarily break the tie-break in `src/data/sync/merge.ts` by changing the deletion-preference line to `return a.kind === 'tombstone' ? b : a`, then re-run.
Expected: FAIL on commutativity. **Revert the change** and confirm PASS again.

- [ ] **Step 4: Commit**

```bash
git add src/data/sync/merge.properties.test.ts
git commit -m "Pin merge convergence with seeded property tests"
```

---

### Task 3: Migrate storage to schema v2

The repository stores a bare `Round[]` today. It needs to store a `SyncState`, record `updatedAt` on writes, and leave a tombstone on delete — without changing the app-facing interface, so the existing UI and its tests are untouched.

**Files:**
- Modify: `src/data/repo/repository.ts`
- Test: `src/data/repo/repo.test.ts` (add cases; existing ones must keep passing)

**Interfaces:**
- Consumes: `SyncState`, `SyncedRound`, `emptySyncState` from Task 1.
- Produces: `CURRENT_SCHEMA_VERSION = 2`; `Repository` gains `loadState(): Promise<SyncState>` and `replaceState(state: SyncState): Promise<void>`; `createRepository(store, options?: { now?: () => string })`.

- [ ] **Step 1: Write the failing tests**

Append to `src/data/repo/repo.test.ts` (keep the existing imports and add `emptySyncState`):

```ts
import { emptySyncState } from '@/data/sync/types'

describe('repository sync state', () => {
  const fixedNow = () => '2026-06-01T00:00:00.000Z'
  const syncRepo = () => createRepository(createMemoryStore(), { now: fixedNow })

  test('stamps a saved round with the time it was written', async () => {
    const repo = syncRepo()
    await repo.saveRound(testRound({ id: 'r1', date: '2026-05-01', totalStrokes: 90 }))
    const state = await repo.loadState()
    expect(state.rounds).toHaveLength(1)
    expect(state.rounds[0]!.updatedAt).toBe('2026-06-01T00:00:00.000Z')
  })

  test('leaves a tombstone when a round is deleted', async () => {
    const repo = syncRepo()
    await repo.saveRound(testRound({ id: 'r1', date: '2026-05-01', totalStrokes: 90 }))
    await repo.deleteRound('r1')
    const state = await repo.loadState()
    expect(state.rounds).toEqual([])
    expect(state.tombstones).toEqual([{ id: 'r1', deletedAt: '2026-06-01T00:00:00.000Z' }])
  })

  test('replaceState swaps the whole record, as a completed sync does', async () => {
    const repo = syncRepo()
    const round = testRound({ id: 'r9', date: '2026-05-05', totalStrokes: 85 })
    await repo.replaceState({
      ...emptySyncState(),
      rounds: [{ round, updatedAt: '2026-05-05T00:00:00.000Z' }],
    })
    expect(await repo.loadRounds()).toEqual([round])
  })

  test('migrates a v1 record, stamping rounds with the migration time', async () => {
    const store = createMemoryStore()
    const round = testRound({ id: 'old', date: '2026-04-01', totalStrokes: 88 })
    // Exactly what v1 wrote: a bare array under the rounds key.
    await store.set('handycap:rounds', [round])
    await store.set('handycap:schemaVersion', 1)

    const repo = createRepository(store, { now: fixedNow })
    expect(await repo.loadRounds()).toEqual([round])
    const state = await repo.loadState()
    expect(state.rounds[0]!.updatedAt).toBe('2026-06-01T00:00:00.000Z')
    expect(await store.get('handycap:schemaVersion')).toBe(2)
  })

  test('an imported round is stamped so it will sync', async () => {
    const source = syncRepo()
    await source.saveRound(testRound({ id: 'r1', date: '2026-05-01', totalStrokes: 90 }))
    const exported = await source.exportJson()

    const target = createRepository(createMemoryStore(), { now: () => '2026-07-01T00:00:00.000Z' })
    await target.importJson(exported)
    expect((await target.loadState()).rounds[0]!.updatedAt).toBe('2026-07-01T00:00:00.000Z')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/data/repo/repo.test.ts`
Expected: FAIL — `repo.loadState is not a function`.

- [ ] **Step 3: Rewrite the repository**

Replace the contents of `src/data/repo/repository.ts`:

```ts
import type { Round } from '@/domain/whs/types'
import { emptySyncState, type SyncState } from '@/data/sync/types'
import type { KeyValueStore } from './store'

/** Bump when the stored shape changes, and add a migration below. */
export const CURRENT_SCHEMA_VERSION = 2

/** v1 wrote a bare `Round[]` here. Read only, for the migration. */
const LEGACY_ROUNDS_KEY = 'handycap:rounds'
const STATE_KEY = 'handycap:sync'
const VERSION_KEY = 'handycap:schemaVersion'

export interface HandyCapExport {
  schemaVersion: number
  exportedAt: string
  rounds: Round[]
}

export interface Repository {
  loadRounds(): Promise<Round[]>
  saveRound(round: Round): Promise<void>
  deleteRound(id: string): Promise<void>
  exportJson(): Promise<string>
  importJson(json: string): Promise<void>
  /** The record plus its sync bookkeeping. Used by the sync engine. */
  loadState(): Promise<SyncState>
  /** Replace the whole record, as the result of a completed sync. */
  replaceState(state: SyncState): Promise<void>
}

export interface RepositoryOptions {
  /** Injected so tests are deterministic. */
  now?: () => string
}

const byDate = (a: Round, b: Round) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)

export function createRepository(
  store: KeyValueStore,
  { now = () => new Date().toISOString() }: RepositoryOptions = {},
): Repository {
  async function readState(): Promise<SyncState> {
    const stored = await store.get<SyncState>(STATE_KEY)
    if (stored) return stored

    // v1 -> v2. At this moment the device holds the only copy of the data that
    // exists, so "last written now" is the correct reading.
    const legacy = await store.get<Round[]>(LEGACY_ROUNDS_KEY)
    if (!legacy) return emptySyncState()

    const at = now()
    const migrated: SyncState = {
      rounds: legacy.map((round) => ({ round, updatedAt: at })),
      tombstones: [],
    }
    await writeState(migrated)
    return migrated
  }

  async function writeState(state: SyncState): Promise<void> {
    await store.set(STATE_KEY, state)
    await store.set(VERSION_KEY, CURRENT_SCHEMA_VERSION)
  }

  return {
    async loadRounds() {
      return (await readState()).rounds.map((entry) => entry.round).sort(byDate)
    },

    async loadState() {
      return readState()
    },

    async replaceState(state) {
      await writeState(state)
    },

    async saveRound(round) {
      const state = await readState()
      const at = now()
      const rounds = state.rounds.filter((entry) => entry.round.id !== round.id)
      rounds.push({ round, updatedAt: at })
      await writeState({
        rounds,
        // A re-saved round outlives any earlier deletion of the same id.
        tombstones: state.tombstones.filter((tombstone) => tombstone.id !== round.id),
      })
    },

    async deleteRound(id) {
      const state = await readState()
      await writeState({
        rounds: state.rounds.filter((entry) => entry.round.id !== id),
        tombstones: [
          ...state.tombstones.filter((tombstone) => tombstone.id !== id),
          { id, deletedAt: now() },
        ],
      })
    },

    async exportJson() {
      const state = await readState()
      // The export is a human-facing backup and deliberately carries no sync
      // bookkeeping, so it stays readable and importable by any version.
      const payload: HandyCapExport = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        exportedAt: now(),
        rounds: state.rounds.map((entry) => entry.round).sort(byDate),
      }
      return JSON.stringify(payload, null, 2)
    },

    async importJson(json) {
      let payload: unknown
      try {
        payload = JSON.parse(json)
      } catch {
        throw new Error('That file is not valid JSON.')
      }

      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('schemaVersion' in payload) ||
        !('rounds' in payload) ||
        !Array.isArray((payload as HandyCapExport).rounds)
      ) {
        throw new Error('That file is not a HandyCap export.')
      }

      const { schemaVersion, rounds } = payload as HandyCapExport
      if (schemaVersion > CURRENT_SCHEMA_VERSION) {
        throw new Error(
          'That export came from a newer version of HandyCap. Update the app first.',
        )
      }

      const at = now()
      await writeState({
        rounds: rounds.map((round) => ({ round, updatedAt: at })),
        tombstones: [],
      })
    },
  }
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS. The 241 existing tests plus the new ones. If any existing repository test fails, the app-facing behaviour has changed and that is a bug in this task, not in the test.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/data/repo/repository.ts src/data/repo/repo.test.ts
git commit -m "Store rounds with sync bookkeeping behind the same interface"
```

---

### Task 4: The remote store interface, its fake, and the sync engine

**Files:**
- Create: `src/data/sync/remote.ts`
- Create: `src/data/sync/engine.ts`
- Test: `src/data/sync/engine.test.ts`

**Interfaces:**
- Consumes: `mergeStates` (Task 1), `SyncState` (Task 1).
- Produces: `RemoteRound`, `RemoteStore`, `createMemoryRemote()`, `toSyncState(rows)`, `toRows(state)`, `SyncCursors`, `SyncOutcome`, `syncOnce(local, remote, cursors)`.

- [ ] **Step 1: Write the failing tests**

Create `src/data/sync/engine.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { testRound } from '@/test/fixtures'
import { createMemoryRemote, toRows } from './remote'
import { syncOnce } from './engine'
import { emptySyncState, type SyncState } from './types'

const withRound = (id: string, date: string, updatedAt: string, totalStrokes = 90): SyncState => ({
  rounds: [{ round: testRound({ id, date, totalStrokes }), updatedAt }],
  tombstones: [],
})

describe('syncOnce', () => {
  test('uploads a guest record to an empty account', async () => {
    const remote = createMemoryRemote()
    const local = withRound('a', '2026-05-01', '2026-05-01T00:00:00.000Z')

    const outcome = await syncOnce(local, remote, {})

    expect(outcome.pushed).toBe(1)
    expect(outcome.state.rounds).toHaveLength(1)
    expect(await remote.pull(undefined)).toHaveLength(1)
  })

  test('pulls a round posted on another device', async () => {
    const remote = createMemoryRemote()
    await remote.push(toRows(withRound('b', '2026-05-02', '2026-05-02T00:00:00.000Z')))

    const outcome = await syncOnce(emptySyncState(), remote, {})

    expect(outcome.pulled).toBe(1)
    expect(outcome.state.rounds.map((r) => r.round.id)).toEqual(['b'])
  })

  test('a round absent from the delta survives — absence is not deletion', async () => {
    const remote = createMemoryRemote()
    const local = withRound('a', '2026-05-01', '2026-05-01T00:00:00.000Z')
    const first = await syncOnce(local, remote, {})

    // Another device adds an unrelated round afterwards.
    await remote.push(toRows(withRound('b', '2026-05-09', '2026-05-09T00:00:00.000Z')))

    // The second pull returns only 'b'. 'a' must not be read as deleted.
    const second = await syncOnce(first.state, remote, first.cursors)
    expect(second.state.rounds.map((r) => r.round.id)).toEqual(['a', 'b'])
  })

  test('propagates a deletion as a tombstone row, not an omission', async () => {
    const remote = createMemoryRemote()
    const local: SyncState = {
      rounds: [],
      tombstones: [{ id: 'a', deletedAt: '2026-05-03T00:00:00.000Z' }],
    }
    await remote.push(toRows(withRound('a', '2026-05-01', '2026-05-01T00:00:00.000Z')))

    const outcome = await syncOnce(local, remote, {})

    expect(outcome.state.rounds).toEqual([])
    const rows = await remote.pull(undefined)
    expect(rows.find((row) => row.roundId === 'a')!.deletedAt).toBe('2026-05-03T00:00:00.000Z')
  })

  test('does not push back what it just pulled', async () => {
    const remote = createMemoryRemote()
    await remote.push(toRows(withRound('b', '2026-05-02', '2026-05-02T00:00:00.000Z')))
    const outcome = await syncOnce(emptySyncState(), remote, {})
    expect(outcome.pushed).toBe(0)
  })

  test('a second sync with no changes does nothing', async () => {
    const remote = createMemoryRemote()
    const local = withRound('a', '2026-05-01', '2026-05-01T00:00:00.000Z')
    const first = await syncOnce(local, remote, {})
    const second = await syncOnce(first.state, remote, first.cursors)
    expect(second.pushed).toBe(0)
    expect(second.pulled).toBe(0)
    expect(second.state).toEqual(first.state)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/data/sync/engine.test.ts`
Expected: FAIL — cannot resolve `./remote` or `./engine`.

- [ ] **Step 3: Write the remote store interface and fake**

Create `src/data/sync/remote.ts`:

```ts
import type { Round } from '@/domain/whs/types'
import { emptySyncState, type SyncState } from './types'

/**
 * One round as the server holds it.
 *
 * A deletion is a row with `deletedAt` set, never a missing row — see
 * `pull`. Timestamps are the exact ISO-8601 UTC strings the client wrote, so
 * that lexicographic comparison stays valid everywhere.
 */
export interface RemoteRound {
  roundId: string
  /** `null` when the row is a tombstone. */
  payload: Round | null
  updatedAt: string
  deletedAt: string | null
}

export interface RemoteStore {
  /**
   * Rows changed strictly after `since`; every row when `since` is undefined.
   *
   * This returns a DELTA. A round absent from the result is unchanged, never
   * deleted — reading absence as deletion would destroy the user's history.
   */
  pull(since: string | undefined): Promise<RemoteRound[]>
  push(rows: RemoteRound[]): Promise<void>
  /** Remove every row for this account. Used by account deletion. */
  deleteEverything(): Promise<void>
}

/** The timestamp a row is ordered by, whichever kind it is. */
export const rowStamp = (row: RemoteRound): string => row.deletedAt ?? row.updatedAt

export function toSyncState(rows: RemoteRound[]): SyncState {
  const state = emptySyncState()
  for (const row of rows) {
    if (row.deletedAt) state.tombstones.push({ id: row.roundId, deletedAt: row.deletedAt })
    else if (row.payload) state.rounds.push({ round: row.payload, updatedAt: row.updatedAt })
  }
  return state
}

export function toRows(state: SyncState): RemoteRound[] {
  return [
    ...state.rounds.map((entry) => ({
      roundId: entry.round.id,
      payload: entry.round,
      updatedAt: entry.updatedAt,
      deletedAt: null,
    })),
    ...state.tombstones.map((tombstone) => ({
      roundId: tombstone.id,
      payload: null,
      updatedAt: tombstone.deletedAt,
      deletedAt: tombstone.deletedAt,
    })),
  ]
}

/** In-memory `RemoteStore`, so the engine is tested without a network. */
export function createMemoryRemote(seed: RemoteRound[] = []): RemoteStore {
  const rows = new Map<string, RemoteRound>(seed.map((row) => [row.roundId, row]))
  return {
    async pull(since) {
      const all = [...rows.values()]
      const changed = since ? all.filter((row) => rowStamp(row) > since) : all
      return changed
        .map((row) => ({ ...row }))
        .sort((a, b) => rowStamp(a).localeCompare(rowStamp(b)))
    },
    async push(incoming) {
      for (const row of incoming) rows.set(row.roundId, { ...row })
    },
    async deleteEverything() {
      rows.clear()
    },
  }
}
```

- [ ] **Step 4: Write the engine**

Create `src/data/sync/engine.ts`:

```ts
import { mergeStates } from './merge'
import { rowStamp, toRows, toSyncState, type RemoteStore } from './remote'
import type { SyncState } from './types'

/**
 * Where this device got to.
 *
 * Both cursors are derived from row timestamps rather than the local clock, so
 * a wrong device clock cannot make the device skip rows it has never seen.
 */
export interface SyncCursors {
  lastPulledAt?: string
  lastPushedAt?: string
}

export interface SyncOutcome {
  state: SyncState
  cursors: SyncCursors
  pulled: number
  pushed: number
}

const highest = (values: string[], fallback?: string): string | undefined =>
  values.reduce<string | undefined>((held, value) => (!held || value > held ? value : held), fallback)

/**
 * One round of sync: pull the delta, merge, hand back the result to persist,
 * and push anything the server has not seen.
 *
 * There is no offline write queue, because the merge is idempotent — a failed
 * sync is simply a sync that has not happened yet.
 */
export async function syncOnce(
  local: SyncState,
  remote: RemoteStore,
  cursors: SyncCursors,
): Promise<SyncOutcome> {
  const pulled = await remote.pull(cursors.lastPulledAt)
  const merged = mergeStates(local, toSyncState(pulled))

  // Rows we have just received are already on the server; pushing them back is
  // harmless but wasteful, so they are skipped by identity.
  const justPulled = new Set(pulled.map((row) => `${row.roundId}@${rowStamp(row)}`))
  const outgoing = toRows(merged).filter((row) => {
    const stamp = rowStamp(row)
    if (justPulled.has(`${row.roundId}@${stamp}`)) return false
    // Strictly newer than the last push. An edit made in the same millisecond
    // as the previous push completed would be skipped, which cannot happen in
    // practice because a push is network I/O — and the alternative (>=) would
    // re-upload the whole record on every idle sync.
    return !cursors.lastPushedAt || stamp > cursors.lastPushedAt
  })

  if (outgoing.length > 0) await remote.push(outgoing)

  return {
    state: merged,
    cursors: {
      // Rows we just pushed are on the server and have been seen, so they
      // advance the pull cursor too. Without this a device that only ever
      // pushes keeps re-pulling its own writes forever.
      lastPulledAt: highest(
        [...pulled.map(rowStamp), ...outgoing.map(rowStamp)],
        cursors.lastPulledAt,
      ),
      lastPushedAt: highest(outgoing.map(rowStamp), cursors.lastPushedAt),
    },
    pulled: pulled.length,
    pushed: outgoing.length,
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/data/sync/engine.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/data/sync/remote.ts src/data/sync/engine.ts src/data/sync/engine.test.ts
git commit -m "Sync a device against a remote store by pulling a delta and merging"
```

---

### Task 5: Two-device convergence

This is the test that actually proves the feature works. Everything before it is machinery.

**Files:**
- Test: `src/data/sync/convergence.test.ts`

**Interfaces:**
- Consumes: `createMemoryRemote` (Task 4), `syncOnce` (Task 4), `createRepository` (Task 3), `createMemoryStore`.
- Produces: nothing — tests only.

- [ ] **Step 1: Write the convergence tests**

Create `src/data/sync/convergence.test.ts`:

```ts
/**
 * Two devices, one account, edits made while offline.
 *
 * Each `device` is a real repository over its own in-memory store, sharing one
 * fake remote — the same code path the app runs, minus the network.
 */
import { describe, expect, test } from 'vitest'
import { testRound } from '@/test/fixtures'
import { createRepository, type Repository } from '@/data/repo/repository'
import { createMemoryStore } from '@/data/repo/store'
import { createMemoryRemote, type RemoteStore } from './remote'
import { syncOnce, type SyncCursors } from './engine'

function device(clock: { at: string }) {
  const repo: Repository = createRepository(createMemoryStore(), { now: () => clock.at })
  let cursors: SyncCursors = {}
  return {
    repo,
    async sync(remote: RemoteStore) {
      const outcome = await syncOnce(await repo.loadState(), remote, cursors)
      await repo.replaceState(outcome.state)
      cursors = outcome.cursors
      return outcome
    },
  }
}

const ids = async (repo: Repository) => (await repo.loadRounds()).map((round) => round.id)

describe('two devices sharing one account', () => {
  test('a round posted on one device reaches the other', async () => {
    const remote = createMemoryRemote()
    const clockA = { at: '2026-05-01T00:00:00.000Z' }
    const clockB = { at: '2026-05-01T00:00:00.000Z' }
    const phone = device(clockA)
    const tablet = device(clockB)

    await phone.repo.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))
    await phone.sync(remote)
    await tablet.sync(remote)

    expect(await ids(tablet.repo)).toEqual(['a'])
  })

  test('offline edits on both devices converge, in either sync order', async () => {
    const remote = createMemoryRemote()
    const clockA = { at: '2026-05-02T00:00:00.000Z' }
    const clockB = { at: '2026-05-03T00:00:00.000Z' }
    const phone = device(clockA)
    const tablet = device(clockB)

    await phone.repo.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))
    await tablet.repo.saveRound(testRound({ id: 'b', date: '2026-05-02', totalStrokes: 85 }))

    await phone.sync(remote)
    await tablet.sync(remote)
    await phone.sync(remote)

    expect(await ids(phone.repo)).toEqual(['a', 'b'])
    expect(await ids(tablet.repo)).toEqual(['a', 'b'])
  })

  test('a delete on one device does not come back from the other', async () => {
    const remote = createMemoryRemote()
    const clockA = { at: '2026-05-02T00:00:00.000Z' }
    const clockB = { at: '2026-05-02T00:00:00.000Z' }
    const phone = device(clockA)
    const tablet = device(clockB)

    await phone.repo.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))
    await phone.sync(remote)
    await tablet.sync(remote)
    expect(await ids(tablet.repo)).toEqual(['a'])

    // Deleted on the phone, later than the write.
    clockA.at = '2026-05-04T00:00:00.000Z'
    await phone.repo.deleteRound('a')
    await phone.sync(remote)

    // The tablet still holds it, and syncing must remove it — twice over.
    await tablet.sync(remote)
    expect(await ids(tablet.repo)).toEqual([])
    await tablet.sync(remote)
    await phone.sync(remote)
    expect(await ids(tablet.repo)).toEqual([])
    expect(await ids(phone.repo)).toEqual([])
  })

  test('a backdated round syncs and the other device recomputes from it', async () => {
    const remote = createMemoryRemote()
    const clockA = { at: '2026-05-10T00:00:00.000Z' }
    const clockB = { at: '2026-05-10T00:00:00.000Z' }
    const phone = device(clockA)
    const tablet = device(clockB)

    await phone.repo.saveRound(testRound({ id: 'recent', date: '2026-05-09', totalStrokes: 90 }))
    await phone.sync(remote)
    await tablet.sync(remote)

    // A round from months ago, entered late. It must land in date order, which
    // is what lets each device replay and re-derive its own differentials.
    clockA.at = '2026-05-11T00:00:00.000Z'
    await phone.repo.saveRound(testRound({ id: 'old', date: '2026-01-04', totalStrokes: 95 }))
    await phone.sync(remote)
    await tablet.sync(remote)

    expect(await ids(tablet.repo)).toEqual(['old', 'recent'])
  })

  test('the later edit of the same round wins on both devices', async () => {
    const remote = createMemoryRemote()
    const clockA = { at: '2026-05-02T00:00:00.000Z' }
    const clockB = { at: '2026-05-05T00:00:00.000Z' }
    const phone = device(clockA)
    const tablet = device(clockB)

    await phone.repo.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))
    await phone.sync(remote)
    await tablet.sync(remote)

    // Both correct the same round offline; the tablet's clock is later.
    await phone.repo.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 88 }))
    await tablet.repo.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 84 }))

    await phone.sync(remote)
    await tablet.sync(remote)
    await phone.sync(remote)

    const onPhone = (await phone.repo.loadRounds())[0]!
    const onTablet = (await tablet.repo.loadRounds())[0]!
    expect(onPhone.totalStrokes).toBe(84)
    expect(onTablet.totalStrokes).toBe(84)
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/data/sync/convergence.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 3: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/data/sync/convergence.test.ts
git commit -m "Prove two devices converge through offline edits and deletes"
```

---

### Task 6: The auth interface and its fake

Written before any Supabase code so that everything above the boundary can be built and tested without an account existing.

**Files:**
- Create: `src/data/auth/auth.ts`
- Test: `src/data/auth/auth.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Account`, `AuthClient`, `createMemoryAuth(options?: { account?: Account | null })`, and on the fake a test-only `deliverMagicLink()` that simulates the user clicking the emailed link.

- [ ] **Step 1: Write the failing tests**

Create `src/data/auth/auth.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { createMemoryAuth } from './auth'

describe('memory auth', () => {
  test('starts signed out', async () => {
    expect(await createMemoryAuth().currentAccount()).toBeNull()
  })

  test('signs in when the emailed link is followed', async () => {
    const auth = createMemoryAuth()
    await auth.sendMagicLink('golfer@example.com')
    expect(await auth.currentAccount()).toBeNull()

    auth.deliverMagicLink()
    const account = await auth.completeSignIn()

    expect(account?.email).toBe('golfer@example.com')
    expect(await auth.currentAccount()).toEqual(account)
  })

  test('gives the same account id for the same email', async () => {
    const first = createMemoryAuth()
    await first.sendMagicLink('golfer@example.com')
    first.deliverMagicLink()
    const a = await first.completeSignIn()

    const second = createMemoryAuth()
    await second.sendMagicLink('golfer@example.com')
    second.deliverMagicLink()
    const b = await second.completeSignIn()

    expect(a!.id).toBe(b!.id)
  })

  test('notifies listeners on sign in and sign out', async () => {
    const auth = createMemoryAuth()
    const seen: (string | null)[] = []
    auth.onChange((account) => seen.push(account?.email ?? null))

    await auth.sendMagicLink('golfer@example.com')
    auth.deliverMagicLink()
    await auth.completeSignIn()
    await auth.signOut()

    expect(seen).toEqual(['golfer@example.com', null])
  })

  test('signs out after the account is deleted', async () => {
    const auth = createMemoryAuth()
    await auth.sendMagicLink('golfer@example.com')
    auth.deliverMagicLink()
    await auth.completeSignIn()

    await auth.deleteAccount()
    expect(await auth.currentAccount()).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/data/auth/auth.test.ts`
Expected: FAIL — cannot resolve `./auth`.

- [ ] **Step 3: Write the interface and fake**

Create `src/data/auth/auth.ts`:

```ts
/**
 * Authentication, behind an interface with a fake.
 *
 * Email is the account identity. Magic link is the only credential in this
 * phase and is never removable — it is the recovery path for the passkey and
 * password credentials added later.
 */
export interface Account {
  id: string
  email: string
}

export interface AuthClient {
  /** The signed-in account, or null for a guest. */
  currentAccount(): Promise<Account | null>
  sendMagicLink(email: string): Promise<void>
  /** Consume a sign-in callback, if the current URL carries one. */
  completeSignIn(): Promise<Account | null>
  signOut(): Promise<void>
  /** Delete the account itself. Local data is untouched — it is still theirs. */
  deleteAccount(): Promise<void>
  onChange(listener: (account: Account | null) => void): () => void
}

export interface MemoryAuth extends AuthClient {
  /** Test-only: simulate the user clicking the emailed link. */
  deliverMagicLink(): void
  /** Test-only: the address the last link was sent to. */
  lastEmail(): string | null
}

/** A stable id per email, so two fakes agree about who a golfer is. */
const idFor = (email: string): string => `acct-${email.toLowerCase().replace(/[^a-z0-9]/g, '-')}`

export function createMemoryAuth({
  account = null,
}: { account?: Account | null } = {}): MemoryAuth {
  let current = account
  let pending: string | null = null
  let followed = false
  const listeners = new Set<(account: Account | null) => void>()

  const announce = () => listeners.forEach((listener) => listener(current))

  return {
    async currentAccount() {
      return current
    },
    async sendMagicLink(email) {
      pending = email
      followed = false
    },
    async completeSignIn() {
      if (!pending || !followed) return null
      current = { id: idFor(pending), email: pending }
      pending = null
      followed = false
      announce()
      return current
    },
    async signOut() {
      current = null
      announce()
    },
    async deleteAccount() {
      current = null
      announce()
    },
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    deliverMagicLink() {
      followed = true
    },
    lastEmail() {
      return pending
    },
  }
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npx vitest run src/data/auth/auth.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/auth/auth.ts src/data/auth/auth.test.ts
git commit -m "Define the auth boundary with an in-memory implementation"
```

---

### Task 7: The sync controller

Orchestration that persists cursors and drives one sync, kept out of React so it is testable on its own and `AppState` stays thin.

**Files:**
- Create: `src/data/sync/controller.ts`
- Test: `src/data/sync/controller.test.ts`

**Interfaces:**
- Consumes: `Repository` (Task 3), `KeyValueStore`, `RemoteStore` (Task 4), `syncOnce` (Task 4).
- Produces: `SyncController`, `createSyncController({ repository, store, remote, accountId })` with `sync(): Promise<SyncOutcome>`.

- [ ] **Step 1: Write the failing tests**

Create `src/data/sync/controller.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { testRound } from '@/test/fixtures'
import { createRepository } from '@/data/repo/repository'
import { createMemoryStore } from '@/data/repo/store'
import { createMemoryRemote } from './remote'
import { createSyncController } from './controller'

const setup = () => {
  const store = createMemoryStore()
  const repository = createRepository(store, { now: () => '2026-05-01T00:00:00.000Z' })
  const remote = createMemoryRemote()
  const controller = createSyncController({ repository, store, remote, accountId: 'acct-1' })
  return { store, repository, remote, controller }
}

describe('sync controller', () => {
  test('writes the merged result back to the repository', async () => {
    const { repository, controller } = setup()
    await repository.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))
    await controller.sync()
    expect((await repository.loadRounds()).map((r) => r.id)).toEqual(['a'])
  })

  test('remembers its cursors across controller instances', async () => {
    const { store, repository, remote, controller } = setup()
    await repository.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))
    await controller.sync()

    const revived = createSyncController({ repository, store, remote, accountId: 'acct-1' })
    const outcome = await revived.sync()
    expect(outcome.pushed).toBe(0)
  })

  test('keeps cursors separate per account', async () => {
    const { store, repository, controller } = setup()
    await repository.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))
    await controller.sync()

    // A different account has its own remote and its own cursors, so the record
    // uploads again rather than being mistaken for already synced.
    const other = createSyncController({
      repository,
      store,
      remote: createMemoryRemote(),
      accountId: 'acct-2',
    })
    const outcome = await other.sync()
    expect(outcome.pushed).toBeGreaterThan(0)
  })

  test('lets a failure propagate without corrupting local data', async () => {
    const { repository } = setup()
    await repository.saveRound(testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 }))
    const broken = createSyncController({
      repository,
      store: createMemoryStore(),
      accountId: 'acct-1',
      remote: {
        pull: async () => {
          throw new Error('offline')
        },
        push: async () => {},
        deleteEverything: async () => {},
      },
    })

    await expect(broken.sync()).rejects.toThrow('offline')
    expect((await repository.loadRounds()).map((r) => r.id)).toEqual(['a'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/data/sync/controller.test.ts`
Expected: FAIL — cannot resolve `./controller`.

- [ ] **Step 3: Write the controller**

Create `src/data/sync/controller.ts`:

```ts
import type { Repository } from '@/data/repo/repository'
import type { KeyValueStore } from '@/data/repo/store'
import { syncOnce, type SyncCursors, type SyncOutcome } from './engine'
import type { RemoteStore } from './remote'

export interface SyncController {
  sync(): Promise<SyncOutcome>
}

export interface SyncControllerOptions {
  repository: Repository
  store: KeyValueStore
  remote: RemoteStore
  accountId: string
}

/** Cursors are per account, so signing into a different one starts clean. */
const cursorKey = (accountId: string) => `handycap:cursors:${accountId}`

export function createSyncController({
  repository,
  store,
  remote,
  accountId,
}: SyncControllerOptions): SyncController {
  return {
    async sync() {
      const cursors = (await store.get<SyncCursors>(cursorKey(accountId))) ?? {}
      // A throw here leaves local data exactly as it was: nothing is written
      // until the merge has come back whole.
      const outcome = await syncOnce(await repository.loadState(), remote, cursors)
      await repository.replaceState(outcome.state)
      await store.set(cursorKey(accountId), outcome.cursors)
      return outcome
    },
  }
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npx vitest run src/data/sync/controller.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/sync/controller.ts src/data/sync/controller.test.ts
git commit -m "Drive one sync and persist its cursors per account"
```

---

### Task 8: Supabase schema, policies, and adapters

The first task that touches a vendor. Everything above this line already works and is tested.

**Files:**
- Create: `supabase/schema.sql`
- Create: `src/data/sync/supabase.ts`
- Create: `src/data/auth/supabase.ts`
- Create: `.env.example`
- Modify: `.gitignore` (add `.env.local`)
- Modify: `package.json` (add `@supabase/supabase-js`)

**Interfaces:**
- Consumes: `RemoteStore`, `RemoteRound` (Task 4); `AuthClient`, `Account` (Task 6).
- Produces: `createSupabaseRemote(accountId): RemoteStore`, `createSupabaseAuth(): AuthClient`, `supabaseConfigured(): boolean`.

- [ ] **Step 1: Install the client**

Run: `npm install @supabase/supabase-js@^2.105.0`
Expected: installs. **This is slow on this machine (minutes) — run it in the background and continue reading.**

- [ ] **Step 2: Write the schema**

Create `supabase/schema.sql`:

```sql
-- One row per round per account.
--
-- Timestamps are TEXT holding the exact ISO-8601 UTC string the client wrote,
-- not timestamptz. The merge compares them lexicographically, and Postgres
-- renders timestamptz as "2026-09-08T12:00:00+00:00" while JavaScript's
-- toISOString() produces "2026-09-08T12:00:00.000Z" — mixing the two formats
-- would silently corrupt conflict resolution.
create table if not exists public.rounds (
  user_id    uuid not null references auth.users (id) on delete cascade,
  round_id   text not null,
  payload    jsonb,
  updated_at text not null,
  deleted_at text,
  primary key (user_id, round_id)
);

-- Serves the incremental pull: rows changed since a cursor, for one account.
create index if not exists rounds_user_updated
  on public.rounds (user_id, updated_at);

alter table public.rounds enable row level security;

-- "You can only ever touch your own rounds", enforced by Postgres rather than
-- by application code that has to be right every time.
drop policy if exists "own rounds" on public.rounds;
create policy "own rounds" on public.rounds
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Account deletion. A client cannot delete an auth user, so this runs as the
-- definer. The cascade on user_id removes the rounds with it.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
```

- [ ] **Step 3: Write the config helper and remote adapter**

Create `src/data/sync/supabase.ts`:

```ts
import type { Round } from '@/domain/whs/types'
import type { RemoteRound, RemoteStore } from './remote'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** False in tests and in any build without credentials; the app stays guest-only. */
export const supabaseConfigured = (): boolean => Boolean(URL && ANON_KEY)

/**
 * The client is imported dynamically, the way `store.ts` imports idb-keyval, so
 * a guest never downloads auth code they do not use.
 *
 * The anon key ships in the bundle by design — it is a public key, and row
 * level security is what protects the data.
 */
let clientPromise: Promise<import('@supabase/supabase-js').SupabaseClient> | null = null

export function supabaseClient() {
  if (!URL || !ANON_KEY) throw new Error('Supabase is not configured.')
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL, ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  )
  return clientPromise
}

/** Normalised so every timestamp in the system is the same ISO-8601 UTC shape. */
const iso = (value: string): string => new Date(value).toISOString()

interface Row {
  round_id: string
  payload: Round | null
  updated_at: string
  deleted_at: string | null
}

export function createSupabaseRemote(accountId: string): RemoteStore {
  return {
    async pull(since) {
      const supabase = await supabaseClient()
      let query = supabase
        .from('rounds')
        .select('round_id, payload, updated_at, deleted_at')
        .eq('user_id', accountId)
      if (since) query = query.gt('updated_at', since)

      const { data, error } = await query.order('updated_at', { ascending: true })
      if (error) throw new Error(error.message)

      return (data ?? []).map((row: Row) => ({
        roundId: row.round_id,
        payload: row.payload,
        updatedAt: iso(row.updated_at),
        deletedAt: row.deleted_at ? iso(row.deleted_at) : null,
      }))
    },

    async push(rows: RemoteRound[]) {
      if (rows.length === 0) return
      const supabase = await supabaseClient()
      const { error } = await supabase.from('rounds').upsert(
        rows.map((row) => ({
          user_id: accountId,
          round_id: row.roundId,
          payload: row.payload,
          updated_at: row.updatedAt,
          deleted_at: row.deletedAt,
        })),
        { onConflict: 'user_id,round_id' },
      )
      if (error) throw new Error(error.message)
    },

    async deleteEverything() {
      const supabase = await supabaseClient()
      const { error } = await supabase.from('rounds').delete().eq('user_id', accountId)
      if (error) throw new Error(error.message)
    },
  }
}
```

- [ ] **Step 4: Write the auth adapter**

Create `src/data/auth/supabase.ts`:

```ts
import { supabaseClient } from '@/data/sync/supabase'
import type { Account, AuthClient } from './auth'

type SessionUser = { id: string; email?: string | null }

const toAccount = (user: SessionUser | null | undefined): Account | null =>
  user && user.email ? { id: user.id, email: user.email } : null

export function createSupabaseAuth(): AuthClient {
  return {
    async currentAccount() {
      const supabase = await supabaseClient()
      const { data } = await supabase.auth.getSession()
      return toAccount(data.session?.user)
    },

    async sendMagicLink(email) {
      const supabase = await supabaseClient()
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/` },
      })
      if (error) throw new Error(error.message)
    },

    async completeSignIn() {
      // detectSessionInUrl consumes the callback fragment on load, so this
      // only has to read back whatever session resulted.
      const supabase = await supabaseClient()
      const { data } = await supabase.auth.getSession()
      return toAccount(data.session?.user)
    },

    async signOut() {
      const supabase = await supabaseClient()
      await supabase.auth.signOut()
    },

    async deleteAccount() {
      const supabase = await supabaseClient()
      const { error } = await supabase.rpc('delete_own_account')
      if (error) throw new Error(error.message)
      await supabase.auth.signOut()
    },

    onChange(listener) {
      let unsubscribe = () => {}
      void supabaseClient().then((supabase) => {
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
          listener(toAccount(session?.user))
        })
        unsubscribe = () => data.subscription.unsubscribe()
      })
      return () => unsubscribe()
    },
  }
}
```

- [ ] **Step 5: Add the environment template and ignore the real file**

Create `.env.example`:

```
# Supabase. Both values are public by design — row level security is what
# protects the data. Copy to .env.local and fill in from the Supabase
# dashboard under Project Settings > API. Without them the app runs
# guest-only, which is a supported mode.
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Run: `printf '\n# Local Supabase credentials\n.env.local\n' >> .gitignore`

- [ ] **Step 6: Create the Supabase project and apply the schema**

Manual, once:
1. Create a free project at supabase.com.
2. In the SQL editor, paste and run `supabase/schema.sql`.
3. Under Authentication > Providers, confirm Email is enabled with magic links.
4. Under Authentication > URL Configuration, add `https://handycap-psi.vercel.app` and `http://localhost:5173` as redirect URLs.
5. Copy the project URL and anon key into `.env.local`.
6. Add both as environment variables in the Vercel project `handycap`.

- [ ] **Step 7: Verify the build and suite are unaffected**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green. No test imports the Supabase adapters, so the suite is unchanged.

- [ ] **Step 8: Commit**

```bash
git add supabase/schema.sql src/data/sync/supabase.ts src/data/auth/supabase.ts .env.example .gitignore package.json package-lock.json
git commit -m "Store rounds in Supabase behind row level security"
```

---

### Task 9: Wire account and sync into app state

**Files:**
- Modify: `src/ui/state/AppState.tsx`
- Modify: `src/test/ui.tsx`
- Test: `src/ui/state/AppState.test.tsx` (add cases)

**Interfaces:**
- Consumes: `AuthClient`, `Account`, `createMemoryAuth` (Task 6); `createSyncController` (Task 7); `createSupabaseAuth`, `createSupabaseRemote`, `supabaseConfigured` (Task 8).
- Produces: `AppState` gains `account: Account | null`, `syncStatus: SyncStatus`, `syncNow(): Promise<void>`, `auth: AuthClient`. `AppProviderProps` gains `auth?: AuthClient` and `remoteFor?: (accountId: string) => RemoteStore`. `renderWithState` gains `auth` and `remoteFor` options.
- `SyncStatus` is `'guest' | 'idle' | 'syncing' | 'offline' | 'error'`.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/state/AppState.test.tsx`. Follow the file's existing `Probe`
pattern — assertions stay on rendered behaviour rather than on a hook result:

```tsx
import { createMemoryAuth } from '@/data/auth/auth'
import { createMemoryRemote } from '@/data/sync/remote'
import { createMemoryStore } from '@/data/repo/store'

/** Surfaces the account and sync fields the account screen reads. */
function AccountProbe() {
  const { rounds, account, syncStatus, loading } = useAppState()
  if (loading) return <p>loading</p>
  return (
    <div>
      <p data-testid="rounds">{rounds.length}</p>
      <p data-testid="account">{account?.email ?? 'guest'}</p>
      <p data-testid="status">{syncStatus}</p>
    </div>
  )
}

describe('account and sync', () => {
  test('is a guest until signed in, and still fully usable', async () => {
    await renderWithState(<AccountProbe />, { rounds: [bogeyRound('a', '2026-05-01')] })
    expect(await screen.findByTestId('account')).toHaveTextContent('guest')
    expect(screen.getByTestId('status')).toHaveTextContent('guest')
    expect(screen.getByTestId('rounds')).toHaveTextContent('1')
  })

  test('pulls the account record on sign-in', async () => {
    const remote = createMemoryRemote([
      {
        roundId: 'b',
        payload: bogeyRound('b', '2026-05-02'),
        updatedAt: '2026-05-02T00:00:00.000Z',
        deletedAt: null,
      },
    ])
    const auth = createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } })

    await renderWithState(<AccountProbe />, {
      auth,
      store: createMemoryStore(),
      remoteFor: () => remote,
    })

    expect(await screen.findByTestId('account')).toHaveTextContent('golfer@example.com')
    await waitFor(() => expect(screen.getByTestId('rounds')).toHaveTextContent('1'))
  })

  test('a sync failure never breaks the app', async () => {
    const auth = createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } })

    await renderWithState(<AccountProbe />, {
      auth,
      store: createMemoryStore(),
      rounds: [bogeyRound('a', '2026-05-01')],
      remoteFor: () => ({
        pull: async () => {
          throw new Error('offline')
        },
        push: async () => {},
        deleteEverything: async () => {},
      }),
    })

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toMatch(/offline|error/),
    )
    // The record is untouched by the failure.
    expect(screen.getByTestId('rounds')).toHaveTextContent('1')
  })
})
```

Add `waitFor` to the `@testing-library/react` import at the top of the file.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/state/AppState.test.tsx`
Expected: FAIL — `result.current.account` is undefined.

- [ ] **Step 3: Extend the provider**

In `src/ui/state/AppState.tsx`, add to the imports:

```ts
import { createMemoryAuth, type Account, type AuthClient } from '@/data/auth/auth'
import { createSupabaseAuth } from '@/data/auth/supabase'
import { createSyncController } from '@/data/sync/controller'
import { createSupabaseRemote, supabaseConfigured } from '@/data/sync/supabase'
import type { RemoteStore } from '@/data/sync/remote'
```

Add to the `AppState` interface:

```ts
  account: Account | null
  syncStatus: SyncStatus
  /** Sync now. Resolves even when it fails — the status carries the outcome. */
  syncNow: () => Promise<void>
  auth: AuthClient
```

Add above the interface:

```ts
export type SyncStatus = 'guest' | 'idle' | 'syncing' | 'offline' | 'error'
```

Add to `AppProviderProps`:

```ts
  auth?: AuthClient
  remoteFor?: (accountId: string) => RemoteStore
  /**
   * Overridable so tests never reach IndexedDB. Sync cursors, the undo
   * snapshot and the nudge flag all live here, so unlike the existing
   * `repository` override this one is load-bearing for tests.
   */
  store?: KeyValueStore
```

Import `type KeyValueStore` from `@/data/repo/store`, and change the existing
store line so an injected one wins:

```ts
  const store = useMemo(() => suppliedStore ?? createIndexedDbStore(), [suppliedStore])
```

destructuring the prop as `store: suppliedStore` in the component signature.

Inside `AppProvider`, after the existing `useMemo`s:

```ts
  const authClient = useMemo(
    () => auth ?? (supabaseConfigured() ? createSupabaseAuth() : createMemoryAuth()),
    [auth],
  )
  const makeRemote = useMemo(
    () => remoteFor ?? ((accountId: string) => createSupabaseRemote(accountId)),
    [remoteFor],
  )

  const [account, setAccount] = useState<Account | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('guest')

  // Adopt whatever session already exists, then follow it.
  useEffect(() => {
    let cancelled = false
    void authClient.currentAccount().then((existing) => {
      if (!cancelled) setAccount(existing)
    })
    const unsubscribe = authClient.onChange((next) => {
      if (!cancelled) setAccount(next)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [authClient])

  const controller = useMemo(
    () =>
      account
        ? createSyncController({
            repository: repo,
            store,
            remote: makeRemote(account.id),
            accountId: account.id,
          })
        : null,
    [account, repo, store, makeRemote],
  )

  const syncNow = useCallback(async () => {
    if (!controller) {
      setSyncStatus('guest')
      return
    }
    setSyncStatus('syncing')
    try {
      await controller.sync()
      setRounds(await repo.loadRounds())
      setSyncStatus('idle')
    } catch {
      // A sync that fails is a sync that has not happened yet. Local data is
      // untouched and the app stays fully usable.
      setSyncStatus(navigator.onLine ? 'error' : 'offline')
    }
  }, [controller, repo])
```

Then the triggers, and a debounced sync after local writes:

```ts
  // Sync on sign-in, on returning to the app, and on regaining the network.
  useEffect(() => {
    if (!controller) {
      setSyncStatus('guest')
      return
    }
    void syncNow()
    const onFocus = () => void syncNow()
    window.addEventListener('online', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('online', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [controller, syncNow])
```

In `saveRound` and `deleteRound`, after `setRounds(...)`, add `void scheduleSync()`, and define above them:

```ts
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleSync = useCallback(() => {
    if (!controller) return
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => void syncNow(), 2000)
  }, [controller, syncNow])
```

Add `useRef` to the React import. Add `account`, `syncStatus`, `syncNow`, `auth: authClient` to the context `value` object and to its dependency array.

- [ ] **Step 4: Extend the test helper**

In `src/test/ui.tsx`, add to `RenderOptions`:

```ts
  auth?: AuthClient
  remoteFor?: (accountId: string) => RemoteStore
  /** Defaults to a fresh memory store, so no test reaches IndexedDB. */
  store?: KeyValueStore
```

Pass all three through to `AppProvider`, defaulting `store` to
`createMemoryStore()` — `createMemoryStore` is already imported in that file.
Import the other types from `@/data/auth/auth`, `@/data/sync/remote` and
`@/data/repo/store`.

- [ ] **Step 5: Run the suite**

Run: `npm test && npm run typecheck`
Expected: all green, including the 241 pre-existing tests.

- [ ] **Step 6: Commit**

```bash
git add src/ui/state/AppState.tsx src/ui/state/AppState.test.tsx src/test/ui.tsx
git commit -m "Follow the signed-in account and sync when it changes"
```

---

### Task 10: The account screen and magic-link sign-in

**Files:**
- Create: `src/ui/screens/AccountScreen.tsx`
- Test: `src/ui/screens/AccountScreen.test.tsx`
- Modify: `src/App.tsx` (add the route/tab, following the existing navigation pattern)

**Interfaces:**
- Consumes: `useAppState` (Task 9).
- Produces: `AccountScreen` component.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/screens/AccountScreen.test.tsx`:

```ts
import { describe, expect, test } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithState } from '@/test/ui'
import { createMemoryAuth } from '@/data/auth/auth'
import { createMemoryRemote } from '@/data/sync/remote'
import { AccountScreen } from './AccountScreen'

describe('AccountScreen', () => {
  test('tells a guest their rounds are only on this device', async () => {
    await renderWithState(<AccountScreen />)
    expect(await screen.findByText(/only on this (phone|device)/i)).toBeInTheDocument()
  })

  test('sends a magic link and says to check email', async () => {
    const auth = createMemoryAuth()
    await renderWithState(<AccountScreen />, { auth, remoteFor: () => createMemoryRemote() })

    await userEvent.type(await screen.findByLabelText(/email/i), 'golfer@example.com')
    await userEvent.click(screen.getByRole('button', { name: /email me a link/i }))

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
    expect(auth.lastEmail()).toBe('golfer@example.com')
  })

  test('rejects an address that is obviously not one', async () => {
    await renderWithState(<AccountScreen />, { auth: createMemoryAuth() })
    await userEvent.type(await screen.findByLabelText(/email/i), 'nope')
    await userEvent.click(screen.getByRole('button', { name: /email me a link/i }))
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument()
  })

  test('shows the signed-in address once signed in', async () => {
    const auth = createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } })
    await renderWithState(<AccountScreen />, { auth, remoteFor: () => createMemoryRemote() })
    expect(await screen.findByText('golfer@example.com')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/screens/AccountScreen.test.tsx`
Expected: FAIL — cannot resolve `./AccountScreen`.

- [ ] **Step 3: Build the screen**

Create `src/ui/screens/AccountScreen.tsx`. Read `src/ui/screens/AboutScreen.tsx` first and follow its layout, heading and Tailwind conventions. Required behaviour:

- **Signed out:** a heading, the honest framing — *"Your rounds live only on this phone. If you lose it, they're gone."* — an email input labelled "Email", and a button "Email me a link". After sending, replace the form with "Check your email — we sent a link to `<address>`." and a "use a different address" reset.
- **Validation:** reject anything without `@` and a dot in the domain with the message "Enter a valid email address."; do not call `sendMagicLink`.
- **Signed in:** show the address, the sync status in plain words (`idle` → "Everything is backed up", `syncing` → "Syncing…", `offline` → "Offline — your rounds are safe on this device", `error` → "Couldn't reach the server. Your rounds are safe on this device."), a "Sync now" button calling `syncNow`, and a "Sign out" button (Task 12 extends this).
- **Guest mode is never disparaged.** No copy implying the app is worse without an account.

- [ ] **Step 4: Add it to navigation**

In `src/App.tsx`, add the screen to the existing navigation the same way the other screens are registered. Read the file first and follow the established pattern exactly.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/AccountScreen.tsx src/ui/screens/AccountScreen.test.tsx src/App.tsx
git commit -m "Offer an optional account with magic-link sign-in"
```

---

### Task 11: The guest-to-account transition

The one moment a user could feel the app did something to their data behind their back. It must be visible and reversible.

**Files:**
- Create: `src/data/sync/adoption.ts`
- Create: `src/ui/components/MergeSummary.tsx`
- Test: `src/data/sync/adoption.test.ts`
- Test: `src/ui/components/MergeSummary.test.tsx`
- Modify: `src/ui/state/AppState.tsx` (capture the snapshot and expose the summary)

**Interfaces:**
- Consumes: `SyncState` (Task 1), `Repository` (Task 3), `KeyValueStore`, `SyncOutcome` (Task 4).
- Produces: `AdoptionSummary { before: number; added: number; after: number }`, `summariseAdoption(before, after): AdoptionSummary`, `saveUndoSnapshot(store, state)`, `takeUndoSnapshot(store): Promise<SyncState | null>`, `clearUndoSnapshot(store)`. `AppState` gains `adoption: AdoptionSummary | null`, `undoAdoption(): Promise<void>`, `dismissAdoption(): void`.

- [ ] **Step 1: Write the failing tests**

Create `src/data/sync/adoption.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { testRound } from '@/test/fixtures'
import { createMemoryStore } from '@/data/repo/store'
import {
  clearUndoSnapshot,
  saveUndoSnapshot,
  summariseAdoption,
  takeUndoSnapshot,
} from './adoption'
import type { SyncState } from './types'

const stateOf = (...ids: string[]): SyncState => ({
  rounds: ids.map((id) => ({
    round: testRound({ id, date: '2026-05-01', totalStrokes: 90 }),
    updatedAt: '2026-05-01T00:00:00.000Z',
  })),
  tombstones: [],
})

describe('adoption', () => {
  test('counts what the device contributed', () => {
    expect(summariseAdoption(stateOf('a', 'b'), stateOf('a', 'b', 'c', 'd'))).toEqual({
      before: 2,
      added: 2,
      after: 4,
    })
  })

  test('reports nothing added when the account already had everything', () => {
    expect(summariseAdoption(stateOf('a'), stateOf('a'))).toEqual({
      before: 1,
      added: 0,
      after: 1,
    })
  })

  test('a saved snapshot can be taken back exactly once', async () => {
    const store = createMemoryStore()
    await saveUndoSnapshot(store, stateOf('a'))
    expect((await takeUndoSnapshot(store))?.rounds).toHaveLength(1)
    expect(await takeUndoSnapshot(store)).toBeNull()
  })

  test('a cleared snapshot cannot be taken', async () => {
    const store = createMemoryStore()
    await saveUndoSnapshot(store, stateOf('a'))
    await clearUndoSnapshot(store)
    expect(await takeUndoSnapshot(store)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/data/sync/adoption.test.ts`
Expected: FAIL — cannot resolve `./adoption`.

- [ ] **Step 3: Write the module**

Create `src/data/sync/adoption.ts`:

```ts
/**
 * The guest-to-account moment.
 *
 * Signing in on a device that already holds rounds merges them into the
 * account. That is the right behaviour, but it is also the one moment a user
 * could feel the app moved their data without asking — so it is summarised and
 * kept undoable.
 */
import type { KeyValueStore } from '@/data/repo/store'
import type { SyncState } from './types'

const UNDO_KEY = 'handycap:adoptionUndo'

export interface AdoptionSummary {
  /** Rounds on this device before signing in. */
  before: number
  /** Rounds the account brought that this device did not have. */
  added: number
  after: number
}

export function summariseAdoption(before: SyncState, after: SyncState): AdoptionSummary {
  const had = new Set(before.rounds.map((entry) => entry.round.id))
  return {
    before: before.rounds.length,
    added: after.rounds.filter((entry) => !had.has(entry.round.id)).length,
    after: after.rounds.length,
  }
}

export const saveUndoSnapshot = (store: KeyValueStore, state: SyncState): Promise<void> =>
  store.set(UNDO_KEY, state)

/** Reads and consumes the snapshot, so an undo cannot be applied twice. */
export async function takeUndoSnapshot(store: KeyValueStore): Promise<SyncState | null> {
  const held = await store.get<SyncState>(UNDO_KEY)
  if (!held) return null
  await store.remove(UNDO_KEY)
  return held
}

export const clearUndoSnapshot = (store: KeyValueStore): Promise<void> => store.remove(UNDO_KEY)
```

- [ ] **Step 4: Wire it into the provider**

In `AppState.tsx`, in `syncNow`, when `account` has just become non-null and this is the first sync for that account:

```ts
      const before = await repo.loadState()
      await saveUndoSnapshot(store, before)
      await controller.sync()
      const after = await repo.loadState()
      setAdoption(summariseAdoption(before, after))
```

`store` here is the provider's injectable store from Task 9, so this is
testable. Add `adoption`, `undoAdoption` (restore via `takeUndoSnapshot` then `repo.replaceState` and `setRounds`), and `dismissAdoption` (`clearUndoSnapshot` and `setAdoption(null)`) to the context value. Only the *first* sync after a sign-in produces a summary; later syncs must not.

- [ ] **Step 5: Build the summary component**

Create `src/ui/components/MergeSummary.tsx`: renders nothing when `adoption` is null or `adoption.added === 0 && adoption.before === 0`. Otherwise a dismissible card reading e.g. *"Your account had 34 rounds. This device added 12. You now have 46."* with "Undo" and "Looks right" actions. Follow `IndexChangeCard.tsx` for structure and tone — the domain returns numbers, the component owns every word.

Create `src/ui/components/MergeSummary.test.tsx` covering: renders nothing for a guest; shows the three counts; "Undo" restores the pre-merge round count; "Looks right" dismisses it and it does not return on re-render.

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/data/sync/adoption.ts src/data/sync/adoption.test.ts src/ui/components/MergeSummary.tsx src/ui/components/MergeSummary.test.tsx src/ui/state/AppState.tsx
git commit -m "Show what signing in did to the record, and let it be undone"
```

---

### Task 12: Flag rounds that look posted twice

Round ids are generated locally, so the same real-world round posted on two devices carries two different ids and the merge keeps both — leaving the Index wrong until the user intervenes.

**Files:**
- Create: `src/domain/stats/duplicates.ts`
- Test: `src/domain/stats/duplicates.test.ts`
- Modify: `src/ui/components/MergeSummary.tsx` (surface the pairs)

**Interfaces:**
- Consumes: `Round` from `@/domain/whs/types`.
- Produces: `DuplicatePair { kept: Round; other: Round }`, `findProbableDuplicates(rounds: Round[]): DuplicatePair[]`.

This module is pure and clock-free, so it belongs in `domain/`. It returns data only — never a message, and never a deletion.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/stats/duplicates.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { testCourse, testRound } from '@/test/fixtures'
import { findProbableDuplicates } from './duplicates'

describe('findProbableDuplicates', () => {
  test('flags the same course, date and score under different ids', () => {
    const rounds = [
      testRound({ id: 'phone', date: '2026-05-01', totalStrokes: 88 }),
      testRound({ id: 'tablet', date: '2026-05-01', totalStrokes: 88 }),
    ]
    const pairs = findProbableDuplicates(rounds)
    expect(pairs).toHaveLength(1)
    expect([pairs[0]!.kept.id, pairs[0]!.other.id].sort()).toEqual(['phone', 'tablet'])
  })

  test('does not flag two different scores on the same day', () => {
    expect(
      findProbableDuplicates([
        testRound({ id: 'a', date: '2026-05-01', totalStrokes: 88 }),
        testRound({ id: 'b', date: '2026-05-01', totalStrokes: 92 }),
      ]),
    ).toEqual([])
  })

  test('does not flag the same score at a different course', () => {
    expect(
      findProbableDuplicates([
        testRound({ id: 'a', date: '2026-05-01', totalStrokes: 88 }),
        testRound({
          id: 'b',
          date: '2026-05-01',
          totalStrokes: 88,
          course: testCourse({ id: 'course-2', name: 'Other Links' }),
        }),
      ]),
    ).toEqual([])
  })

  test('does not flag a genuine 36-hole day at different tees', () => {
    expect(
      findProbableDuplicates([
        testRound({ id: 'a', date: '2026-05-01', totalStrokes: 88 }),
        testRound({
          id: 'b',
          date: '2026-05-01',
          totalStrokes: 88,
          course: testCourse({ tee: { ...testCourse().tee, key: 'blue-male', name: 'Blue' } }),
        }),
      ]),
    ).toEqual([])
  })

  test('finds nothing in a clean record', () => {
    expect(
      findProbableDuplicates([
        testRound({ id: 'a', date: '2026-05-01', totalStrokes: 88 }),
        testRound({ id: 'b', date: '2026-05-08', totalStrokes: 88 }),
      ]),
    ).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/domain/stats/duplicates.test.ts`
Expected: FAIL — cannot resolve `./duplicates`.

- [ ] **Step 3: Write the module**

Create `src/domain/stats/duplicates.ts`:

```ts
import type { Round } from '@/domain/whs/types'

export interface DuplicatePair {
  kept: Round
  other: Round
}

/** Gross strokes, however the round recorded them. */
const strokesOf = (round: Round): number | null =>
  round.totalStrokes ??
  (round.holeScores.length > 0
    ? round.holeScores.reduce((total, hole) => total + (hole.strokes ?? 0), 0)
    : null)

/**
 * Rounds that look like the same round entered twice.
 *
 * Same course, same tee, same date, same gross score, different ids. The tee is
 * part of the key so a genuine 36-hole day from different tees is not flagged.
 *
 * Detection only. Deleting a round is always the golfer's decision — a wrong
 * guess here would silently change someone's Handicap Index.
 */
export function findProbableDuplicates(rounds: Round[]): DuplicatePair[] {
  const seen = new Map<string, Round>()
  const pairs: DuplicatePair[] = []

  for (const round of rounds) {
    const strokes = strokesOf(round)
    if (strokes === null) continue

    const key = [round.date, round.course.id, round.course.tee.key, round.holeCount, strokes].join('|')
    const held = seen.get(key)
    if (held) pairs.push({ kept: held, other: round })
    else seen.set(key, round)
  }

  return pairs
}
```

- [ ] **Step 4: Surface it**

In `MergeSummary.tsx`, when the adoption summary is shown, call `findProbableDuplicates(rounds)` and, if any pairs exist, add a line — *"Two rounds look like the same round posted twice."* — linking to the rounds screen. **Never offer a one-tap delete-both, and never auto-delete.** Add a test asserting the notice appears for a duplicate pair and does not for a clean record.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/domain/stats/duplicates.ts src/domain/stats/duplicates.test.ts src/ui/components/MergeSummary.tsx src/ui/components/MergeSummary.test.tsx
git commit -m "Flag rounds that look posted twice without deleting anything"
```

---

### Task 13: Sign-out and account deletion

**Files:**
- Modify: `src/ui/screens/AccountScreen.tsx`
- Modify: `src/ui/screens/AccountScreen.test.tsx`
- Modify: `src/ui/state/AppState.tsx` (add `signOut`, `deleteAccount`)

**Interfaces:**
- Consumes: `AuthClient.signOut`, `AuthClient.deleteAccount` (Task 6); `RemoteStore.deleteEverything` (Task 4); `Repository.replaceState` (Task 3).
- Produces: `AppState` gains `signOut(options: { wipeLocal: boolean }): Promise<void>` and `deleteAccount(): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/screens/AccountScreen.test.tsx`:

```ts
describe('leaving', () => {
  const signedIn = () => createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } })

  test('signing out keeps the rounds on the device', async () => {
    const auth = signedIn()
    await renderWithState(<AccountScreen />, {
      auth,
      remoteFor: () => createMemoryRemote(),
      rounds: [testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 })],
    })

    await userEvent.click(await screen.findByRole('button', { name: /^sign out$/i }))

    expect(await screen.findByText(/only on this (phone|device)/i)).toBeInTheDocument()
    expect(await screen.findByText(/1 round is still on this device/i)).toBeInTheDocument()
  })

  test('offers a separate sign out that removes local data', async () => {
    const auth = signedIn()
    const { repository } = await renderWithState(<AccountScreen />, {
      auth,
      remoteFor: () => createMemoryRemote(),
      rounds: [testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 })],
    })

    await userEvent.click(await screen.findByRole('button', { name: /remove.*this device/i }))
    await userEvent.click(await screen.findByRole('button', { name: /yes, remove/i }))

    expect(await repository.loadRounds()).toEqual([])
  })

  test('deleting the account needs the email typed to confirm', async () => {
    const auth = signedIn()
    await renderWithState(<AccountScreen />, { auth, remoteFor: () => createMemoryRemote() })

    await userEvent.click(await screen.findByRole('button', { name: /delete my account/i }))
    const confirm = await screen.findByRole('button', { name: /permanently delete/i })
    expect(confirm).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/type your email/i), 'golfer@example.com')
    expect(confirm).toBeEnabled()
  })

  test('deleting the account leaves the local rounds alone', async () => {
    const auth = signedIn()
    const { repository } = await renderWithState(<AccountScreen />, {
      auth,
      remoteFor: () => createMemoryRemote(),
      rounds: [testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 })],
    })

    await userEvent.click(await screen.findByRole('button', { name: /delete my account/i }))
    await userEvent.type(screen.getByLabelText(/type your email/i), 'golfer@example.com')
    await userEvent.click(screen.getByRole('button', { name: /permanently delete/i }))

    expect(await screen.findByText(/only on this (phone|device)/i)).toBeInTheDocument()
    expect((await repository.loadRounds()).map((r) => r.id)).toEqual(['a'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/screens/AccountScreen.test.tsx`
Expected: FAIL — no sign-out control.

- [ ] **Step 3: Implement**

In `AppState.tsx`, importing `emptySyncState` from `@/data/sync/types`:

```ts
  const signOut = useCallback(
    async ({ wipeLocal }: { wipeLocal: boolean }) => {
      await authClient.signOut()
      if (wipeLocal) {
        await repo.replaceState(emptySyncState())
        setRounds([])
      }
      setSyncStatus('guest')
    },
    [authClient, repo],
  )

  const deleteAccount = useCallback(async () => {
    // The rows go first: if deleting the auth user fails, the golf data is
    // already gone, which is the safer half to lose.
    if (account) await makeRemote(account.id).deleteEverything()
    await authClient.deleteAccount()
    setSyncStatus('guest')
    // Local data is deliberately untouched. It is still theirs, and the app
    // keeps working as a guest.
  }, [account, authClient, makeRemote])
```

In `AccountScreen.tsx`, signed in, add:
- **"Sign out"** — plain, immediate, keeps local data. Afterwards show "N rounds are still on this device."
- **"Sign out and remove from this device"** — behind a confirmation with a "Yes, remove" button, for a borrowed phone.
- **"Delete my account"** — a distinct destructive section requiring the account email typed into a field labelled "Type your email to confirm" before "Permanently delete" enables. Copy must state plainly that this removes the account and its synced rounds, and that rounds on this device are kept.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/AccountScreen.tsx src/ui/screens/AccountScreen.test.tsx src/ui/state/AppState.tsx
git commit -m "Sign out without losing rounds, and delete an account for real"
```

---

### Task 14: The nudge, the About rewrite, and the privacy policy

The app currently promises on-device-only storage. Shipping accounts without correcting that would make the About sheet untrue.

**Files:**
- Modify: `src/ui/screens/AboutScreen.tsx`
- Create: `src/ui/screens/PrivacyScreen.tsx`
- Create: `src/ui/components/BackupNudge.tsx`
- Test: `src/ui/components/BackupNudge.test.tsx`
- Modify: `src/ui/screens/IndexScreen.tsx` (mount the nudge)

**Interfaces:**
- Consumes: `useAppState` (Task 9), `Repository` via the existing store for the dismissal flag.
- Produces: `BackupNudge` component, `PrivacyScreen` component.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/components/BackupNudge.test.tsx`:

```ts
import { describe, expect, test } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithState } from '@/test/ui'
import { createMemoryAuth } from '@/data/auth/auth'
import { createMemoryRemote } from '@/data/sync/remote'
import { testRound } from '@/test/fixtures'
import { BackupNudge } from './BackupNudge'

const rounds = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    testRound({ id: `r${i}`, date: `2026-05-0${(i % 9) + 1}`, totalStrokes: 90 }),
  )

describe('BackupNudge', () => {
  test('stays quiet below five rounds', async () => {
    await renderWithState(<BackupNudge />, { rounds: rounds(4) })
    expect(screen.queryByText(/only on this (phone|device)/i)).not.toBeInTheDocument()
  })

  test('appears once the index means something', async () => {
    await renderWithState(<BackupNudge />, { rounds: rounds(5) })
    expect(await screen.findByText(/only on this (phone|device)/i)).toBeInTheDocument()
  })

  test('never appears for a signed-in golfer', async () => {
    await renderWithState(<BackupNudge />, {
      rounds: rounds(8),
      auth: createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } }),
      remoteFor: () => createMemoryRemote(),
    })
    expect(screen.queryByText(/only on this (phone|device)/i)).not.toBeInTheDocument()
  })

  test('stays dismissed once dismissed', async () => {
    const { unmount, repository } = await renderWithState(<BackupNudge />, { rounds: rounds(6) })
    await userEvent.click(await screen.findByRole('button', { name: /no thanks/i }))
    expect(screen.queryByText(/only on this (phone|device)/i)).not.toBeInTheDocument()

    unmount()
    await renderWithState(<BackupNudge />, { rounds: rounds(6), repository })
    expect(screen.queryByText(/only on this (phone|device)/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/components/BackupNudge.test.tsx`
Expected: FAIL — cannot resolve `./BackupNudge`.

- [ ] **Step 3: Build the nudge**

Create `src/ui/components/BackupNudge.tsx`. Rules, all load-bearing:

- Renders nothing when signed in, when `rounds.length < 5`, or when previously dismissed (persist the flag under `handycap:nudgeDismissed` in the same store).
- **Never a modal, never blocking.** An inline dismissible card.
- Copy is the honest framing: *"Your rounds live only on this phone. If you lose it, they're gone."* with "Back them up" (to the account screen) and "No thanks".
- Dismissal is permanent.

Mount it on `IndexScreen.tsx` below the index, following that file's existing layout conventions.

- [ ] **Step 4: Rewrite the About sheet and add the privacy policy**

In `AboutScreen.tsx`, replace the on-device-only claim with an accurate description of both modes:
- As a guest, rounds are stored only on the device and nothing is sent anywhere.
- With an account, rounds sync to a server so they reach other devices; the email address and the rounds are all that is stored.
- Deleting the account removes the account and its synced rounds.
- Keep the existing OpenGolfAPI ODbL attribution and the "not an official handicap" statement untouched.
- Link to the privacy screen.

Create `src/ui/screens/PrivacyScreen.tsx` stating, in plain language: what is stored (email address, rounds, nothing else), that there is no advertising and no third-party analytics on the data, that guest mode sends nothing, how to delete an account and what that removes, and that data is held on Supabase as the hosting provider. Follow `AboutScreen.tsx`'s layout.

- [ ] **Step 5: Run the full verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/BackupNudge.tsx src/ui/components/BackupNudge.test.tsx src/ui/screens/AboutScreen.tsx src/ui/screens/PrivacyScreen.tsx src/ui/screens/IndexScreen.tsx src/App.tsx
git commit -m "Offer backup once the Index means something, and say what is stored"
```

---

## Final verification

- [ ] `npm test` — all green, including the 241 pre-existing tests
- [ ] `npm run typecheck` — no errors
- [ ] `npm run build` — production build passes
- [ ] Manual: with `.env.local` unset, the app runs and the account screen is absent or inert — guest mode must not depend on Supabase
- [ ] Manual: sign in on two browsers against the real project, post a round in one, confirm it appears in the other
- [ ] Manual: delete a round in one browser, sync both, confirm it does not come back
- [ ] Update `ROADMAP.md` — it still claims 155 tests in one place and 196 in another

## What Part 2 covers

Spec build steps 5 and 6: passkey enrolment and sign-in via `supabase.auth`, and email+password as a third credential on the same email identity. Both are additive to the `AuthClient` interface defined in Task 6 and require no change to the sync engine.
