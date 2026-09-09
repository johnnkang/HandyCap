# Where HandyCap stands

Last updated 2026-09-09.

`main` is deployed and green. A feature branch, **`accounts-and-sync`**, adds
optional accounts and cross-device sync. It is finished, reviewed and pushed to
GitHub, but **deliberately not merged** — merging auto-deploys, and the sync
engine has never run against a real Supabase project. See "In flight" below.

On `main`: **241 tests**, typecheck clean, production build passing. Live at
https://handycap-psi.vercel.app

Everything in the original brief is built — per-course handicap, an overall index
across courses, forecasting from recent scores, full score history with average,
best and worst, and the Par 3/4/5 strengths analysis.

## In flight: optional accounts and sync

Branch `accounts-and-sync`, **336 tests**, typecheck clean, build green. Pushed
to GitHub but **not merged** — `main` still deploys the guest-only app.

Guest mode stays the default and stays offline. An account is optional and gives
true two-way sync: post a round on your phone, it is on your iPad. Conflicts
resolve by last-write-wins per round with tombstones for deletions, proven
convergent by property tests and by two simulated devices sharing one fake
remote.

Design: `docs/superpowers/specs/2026-09-08-optional-accounts-and-sync-design.md`
Plan: `docs/superpowers/plans/2026-09-08-accounts-and-sync.md`
Progress ledger, including every ruling made along the way:
`.superpowers/sdd/2026-09-08-accounts-and-sync/progress.md`

Reviewed throughout: every task passed its own review, and a final
whole-branch review found two concurrency defects at the seam where sync
writes and user writes meet — a save landing mid-sync could be destroyed, and
a sync in flight could resurrect a wiped device. Both are fixed and pinned by
tests that fail without them.

**Without Supabase credentials the account surface is absent entirely** — the
app is exactly the guest-only calculator it is today, not a feature with dead
buttons. That gate is tested in both directions.

**Before this can merge — needs you:**

1. Create the Supabase project, run `supabase/schema.sql`, enable email magic
   links, add redirect URLs for `localhost:5173` and `handycap-psi.vercel.app`,
   and set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env.local` and
   in Vercel.
2. A manual two-browser check: post a round in one, confirm it appears in the
   other; delete it in one, confirm it stays deleted.

Merging auto-deploys to production, so do those first. Nothing in the test
suite depends on either.

Passkeys and email+password are Part 2 and are not built. Magic link alone is a
complete product, which is why the plan stops here.

## Pick up here (on `main`)

**1. Check it against a real GHIN index.** Still the most valuable thing left and
the one thing the test suite cannot do — every other test asserts the engine
matches *our reading* of the Rules, not that our reading is right.

Waiting on a GHIN account. The harness is already built, so this becomes a
paste-and-run job the moment one exists: fill in `ghin-data.json` at the project
root (gitignored; copy `ghin-data.example.json` for the shape) and `npm test`
reconciles it. It checks per-round Score Differentials and the final index
separately, which distinguishes an arithmetic bug from a bug in selecting and
averaging the lowest 8. Without that file the suite skips it entirely.

Expect some divergence that is not a bug: PCC days and any lone nine are the two
deliberate approximations described under "Known limits".

## Done since

- **The retrospective engine.** HandyCap now answers "why did my Handicap Index
  change?" — the most-asked question in golf, and one no competitor app answers.
  Every movement is attributed to its actual causes with a stroke value each: a
  round entering, a good round ageing out, the Rule 5.2a row changing, a cap
  biting, a Rule 5.9 reduction fading, or a backdated round silently re-deriving
  a score posted months ago. The parts sum to the whole exactly, which a seeded
  property test pins across 400 random records.

  It shows on the Index screen after posting, in a browsable history of every
  movement, and inside each round as "what this round is worth". The engine
  compares two scoring records rather than watching one being built, because
  only that can describe a deletion or an import — and because a backdated round
  changes the Course Handicap held at later rounds, which silently rewrites
  their differentials.

- **Vercel now auto-deploys.** Connected to `johnnkang/HandyCap` on 2026-09-07,
  production branch `main`, verified against the Vercel API. The earlier
  `vercel git connect` failures were the Vercel GitHub App not being installed
  for the `johnnkangs-projects` team; installing it from the Vercel dashboard
  fixed it and the CLI then reported the repo already connected. Pushes to `main`
  deploy on their own — `npx vercel --prod` is no longer needed.
- **UI component tests.** The app state, index screen, rounds screen, posting
  flow, record strip and explanation disclosures are covered — 241 tests on
  `main`, up from 155. The posting tests were mutation-checked: breaking the save and
  skewing the differential preview each failed exactly one test.
- **GitHub MCP works.** A fine-grained PAT in `~/.claude/settings.json` plus a
  full Claude Code restart; the tools authenticate as `johnnkang`.
- **Merged.** `phase-2-history-insights-forecast` fast-forwarded into `main` on
  2026-09-07 and pushed; the branch is deleted locally and on the remote. `main`
  is now the deployed, tested state. Verified green after the merge: 155 tests,
  typecheck clean.

## Deliberately deferred

Decided against for the first version, not forgotten:

- Multiple player profiles — track a spouse, kid or regular partner on one device
- Cloud accounts and sync across devices
- GPS and rangefinder features

## Known limits

- The remaining untested UI is the presentational end: the About, Insights and
  Forecast screens, the charts, and the manual course form. The index and
  posting flows, the scoring record strip, the explanations and app state now
  have component tests; the domain and data layers remain thoroughly
  test-driven.
- PCC is treated as zero and nine-hole rounds are paired. Both are deliberate and
  explained in the README and in the app's About sheet.
- Not an official handicap. HandyCap is not a licensed provider.
