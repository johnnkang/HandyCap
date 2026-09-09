# Optional accounts and cross-device sync

Design, 2026-09-08. Status: approved, not yet implemented.

## The decision this reverses

HandyCap has been on-device only since it was built: IndexedDB, no accounts, no
backend, JSON export as the backup story. That was reaffirmed deliberately, even
under the "product for other golfers" goal.

This design adds optional accounts on top of it. The reversal is narrow and
intentional: **guest mode stays the default and stays fully offline.** What
changes is that a user who wants their data on a second device can now have it.

## What we are building

An account is optional. It promises one thing: **true sync across devices.**
Post a round on your phone at the course, it is on your iPad at home. Both
devices stay fully usable offline and reconcile when they reconnect.

Explicitly not "backup and restore". Restore-style sync that silently discards
the round you posted on the other phone is worse than no sync at all, because it
loses data at exactly the moment the user believed they were protected.

## Non-goals

- Guest mode is **not** a trial. No degradation, no nag screens, no locked
  features for someone who never signs up.
- No leagues, no social graph, no sharing between accounts. The account holds
  one golfer's rounds and nothing else.
- No server-side handicap computation. The backend stores rounds and does not
  know what the World Handicap System is.

## Constraints that drove the design

- **$0 until there is traction.** Free tiers only, with a known path if
  outgrown.
- **Guest mode must remain genuinely offline**, not merely offline-capable.
- **`src/domain/` stays pure** — no React, no network, no ambient clock. Sync is
  a persistence concern and must not leak into the WHS engine.
- **Sign-in methods: magic link, passkeys, email + password.** No Google
  sign-in; the third-party identity was declined deliberately, consistent with
  the app's privacy positioning.

## Provider: Supabase

Chosen because it covers all three sign-in methods first-party. Magic link and
email+password are core; passkeys shipped in beta in May 2026 and require
`@supabase/supabase-js` v2.105 or later.

Alternatives weighed:

- **Cloudflare Workers + D1** has the roomiest free tier (5 GB storage, 5M
  reads/day, 100k writes/day) and no pause behaviour, but no first-party auth.
  It would mean hand-writing magic-link issuance, session management, password
  hashing and the WebAuthn ceremony — the code you least want to own in an app
  whose pitch is trustworthiness. This is the fallback if Supabase is outgrown.
- **Firebase** has no passkey support and its extension route dies 2027-03-31.

**Cost.** Modelling a golfer at ~40 rounds of ~1.5 KB posting ~2 rounds/week,
all three providers are free to roughly 5,000 users. The binding limit on
Supabase's free tier is 500 MB of database storage, not traffic — reached around
5,000–8,000 users, at which point Pro is $25/month. Auth is free to 50,000
monthly active users.

**Known operational gotcha:** Supabase pauses a free project after 7 days with
zero API traffic. Data is not lost, but the project is unreachable until
restored from the dashboard. This bites before launch, not after — a scheduled
ping keeps it warm.

## Data model

Offline edits on two devices mean deciding which version wins without a server
referee. That needs a per-round timestamp and a memory of deletions — without
tombstones, a round deleted on one device is resurrected by the other on the
next sync.

**Neither goes on `Round`.** They are persistence concerns, not WHS properties,
and the purity of `src/domain/` is load-bearing. The envelope lives in the data
layer:

```ts
// src/data/sync/types.ts
interface SyncedRound { round: Round; updatedAt: string }
interface Tombstone   { id: string;   deletedAt: string }
interface SyncState   { rounds: SyncedRound[]; tombstones: Tombstone[] }
```

`Round` is untouched. The domain never learns that sync exists.

### Storage migration

This changes the stored shape, so `CURRENT_SCHEMA_VERSION` goes to 2 and the
repository gains the migration its comment already anticipates. Existing
`Round[]` becomes `SyncedRound[]` with `updatedAt` set to the migration
timestamp — at that moment the local device holds the only data that exists, so
"local is current" is the correct reading.

JSON export keeps its present shape. It is a human-facing backup and should not
carry sync bookkeeping; import sets `updatedAt` to now.

### Remote schema

One row per round, not one blob per user:

```
rounds(user_id, round_id, payload jsonb, updated_at, deleted_at)
primary key (user_id, round_id)
```

This gives incremental pulls (`where updated_at > lastPulledAt`), avoids two
devices clobbering a whole-record write, and lets row-level security express
"you can only touch your own rounds" as a Postgres policy (`user_id =
auth.uid()`) rather than as application code that has to be right every time.

A deletion is a row with `deleted_at` set — tombstones are symmetric across
local and remote.

## The merge

One pure, total function: `mergeStates(local, remote): SyncState`.

For each round id appearing on either side, gather up to four candidates — local
round, remote round, local tombstone, remote tombstone — and take the one with
the latest timestamp. A tombstone winning means the round stays deleted. This is
last-write-wins per round, with deletions as first-class citizens.

**Tie-breaks.** Equal timestamps prefer the deletion: a round staying deleted is
a better failure than one silently reappearing. Two rounds tying on the same
millisecond fall back to a deterministic comparison of their serialised content,
so the function stays commutative regardless.

**Tombstones are never pruned.** They are roughly 60 bytes; a user who deleted
100 rounds costs 6 KB. Pruning would buy nothing measurable and would open a
window in which a long-offline device resurrects deleted rounds.

**Known limitation: `updatedAt` comes from the device clock.** A device with a
badly wrong clock wins or loses conflicts unfairly. This is the standard
trade-off for offline last-write-wins; vector clocks are a great deal of
machinery for an app where two devices editing the *same round* is already rare.
Accepted deliberately.

**Known limitation: the pull cursor is sequence-order, not commit-order.** The
`BEFORE` trigger stamps a row's cursor from a sequence when the write starts,
not when it commits, so two pushes overlapping by a fraction of a millisecond
can commit in the opposite order to their cursors. A pull landing exactly
between the two commits would see the higher cursor, advance past the lower one,
and never be handed that row again on that device. Nothing is ever lost from the
server — the row is there for any other device, and the next edit to it stamps a
fresh cursor — so this hides a row from one device rather than destroying it.
Closing it properly means commit-ordered sequencing, which is a real piece of
database machinery for a sub-millisecond window in an app where two devices push
at once only by coincidence. Accepted deliberately.

### Why sync rounds and never computed results

The engine replays forward in time, and a backdated round revises the
differentials of rounds already posted, because `courseHandicapAtRound` changes
the net double bogey cap. If devices sync raw rounds and each recomputes
locally, correctness follows by construction. If a computed index were ever
synced, devices would disagree. This is also what keeps the backend dumb.

## The sync engine

Four steps, no state machine:

1. Pull rows changed since the stored `lastPulledAt` cursor
2. `mergeStates(local, remote)`
3. Write the result locally
4. Push everything whose `updatedAt` is newer than `lastPushedAt`

Because the merge is idempotent, there is no offline write queue to maintain. A
failed sync is simply a sync that has not happened yet.

**The pull returns a delta, and absence from it means "unchanged", never
"deleted".** `mergeStates` is called with the full local state and only the
remote rows that changed since the cursor. An id present locally but missing
from the delta therefore survives untouched — it has no competing candidate.
Remote deletions arrive as tombstone rows with `deleted_at` set, never as
omissions. Reading absence as deletion here would silently destroy the user's
history, so it is worth an explicit test.

Both cursors, `lastPulledAt` and `lastPushedAt`, are stored locally in the same
key/value store as the rounds, per account.

**Triggers:** sign-in, app load and foreground, the browser `online` event, a
~2s debounce after any local write, and a manual "sync now".

**Failure handling:** a sync failure is never fatal and never blocks the UI. The
local app is fully functional regardless. A quiet status indicator shows synced
/ syncing / offline / could not reach the server.

## Guest to account transition

**New account, device has guest data.** Upload wholesale; nothing to reconcile.

**Existing account, device also has guest data.** The dangerous case: signing in
on an old tablet holding 12 rounds to an account holding 34. The same merge
function runs and the result is the union, but it must be **visible and
reversible** — show what happened ("your account had 34, this device added 12,
you now have 46") and keep a pre-merge snapshot in IndexedDB so undo is one tap.

**Duplicate rounds are a real gap.** Round ids are generated locally, so the
same real-world round posted on two devices carries two different ids. The merge
cannot see these as duplicates and will keep both, leaving the index wrong until
the user deletes one. Same course, same date and same score is a reliable enough
signal, so a merge producing any such pair offers a review step. **Detection
only — never auto-delete a round.**

**Sign-out keeps local data by default.** Wiping someone's rounds because they
signed out is catastrophic and surprising. A separate, clearly labelled "sign
out and remove from this device" covers a borrowed or shared phone.

**Account deletion actually deletes** the server rows, leaving local data alone
— it is still the user's, and the app still works as a guest afterward. This has
to be genuinely functional rather than a mailto: link, both because it is right
and because it is what makes the privacy claim defensible.

### Where the offer appears

A permanent quiet entry in settings, plus exactly one contextual nudge after the
user has posted 5 rounds — the point at which WHS produces a meaningful index —
dismissible forever, never modal.

The copy is the honest version because it is also the strongest: *"Your rounds
live only on this phone. If you lose it, they're gone."*

## Auth surface

**Email is the account identity; credentials layer on top of it.**

Sign-in takes an email, then offers a passkey if one is registered on the
device, a password if one is set, and "email me a link instead" always.

**Magic link is never removable.** It is the recovery path when someone loses
both their device and their password, which makes it the foundation rather than
one of three equals.

Magic link alone is a complete, shippable product. Passkeys and password are
genuinely additive and are the natural scope cut if this needs to ship sooner.

## Testing

Everything network-facing sits behind an interface with a fake, mirroring how
`opengolf/client.ts` is already tested against fixtures. **No test touches the
network or a real Supabase project.**

- **`mergeStates`** — unit tests plus a seeded property test pinning
  commutativity (device order is irrelevant), idempotence (syncing twice changes
  nothing) and associativity (three devices converge regardless of pairing).
  Same technique already load-bearing for the retrospective engine.
- **Two-device convergence** — the test that actually proves this works: two
  simulated devices sharing one in-memory fake remote. Post on A, delete on B
  while offline, backdate on A, sync in both orders, assert identical final
  state on both.
- **Migration** — v1 data loads, gains timestamps, and round-trips.
- **UI** — sign-in flow, merge summary and undo, via the existing
  `src/test/ui.tsx` helper extended with auth and sync overrides.

## File layout

```
src/data/sync/types.ts       SyncedRound, Tombstone, SyncState
src/data/sync/merge.ts       pure mergeStates() — no I/O
src/data/sync/engine.ts      pull -> merge -> write -> push
src/data/sync/remote.ts      RemoteStore interface + in-memory fake
src/data/sync/supabase.ts    Supabase RemoteStore implementation
src/data/auth/auth.ts        AuthClient interface + in-memory fake
src/data/auth/supabase.ts    Supabase AuthClient implementation
src/ui/screens/AccountScreen.tsx
src/ui/components/SignIn.tsx
src/ui/components/MergeSummary.tsx
```

Plus the repository migration and `AppState` wiring. The app-facing `Repository`
interface is unchanged, so existing UI and its tests are unaffected.

## Implementation notes

- **The Supabase client is dynamically imported**, the way `store.ts` already
  does with `idb-keyval`, so guests never download auth code they do not use.
- **The Supabase anon key ships in the client bundle.** This is by design — it
  is a public key, and row-level security is what protects the data. Recorded
  here so it is not later mistaken for a leak.
- Config via `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, set in Vercel.

## Out-of-code work this forces

- The About sheet currently promises on-device-only storage and must be
  rewritten to describe both modes honestly.
- Holding email addresses means a real privacy policy.

Both are part of the feature, not paperwork afterward.

## Build order

Risk is front-loaded into code that needs no Supabase account at all. If
Supabase later proves wrong, only step 3 is rewritten.

1. Types, `mergeStates`, migration to schema v2 — pure, fully tested
2. `RemoteStore` interface, fake, engine, two-device convergence tests — still
   no network
3. Supabase project, schema, RLS policies, magic-link sign-in — first real
   network
4. Guest-to-account transition, merge summary, undo
5. Passkeys
6. Email and password
7. Account deletion, About rewrite, privacy policy
