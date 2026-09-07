# Where HandyCap stands

Last updated 2026-09-07.

All three planned phases are complete, deployed, and green: **155 tests**,
typecheck clean, production build passing. Live at
https://handycap-psi.vercel.app

Everything in the original brief is built — per-course handicap, an overall index
across courses, forecasting from recent scores, full score history with average,
best and worst, and the Par 3/4/5 strengths analysis.

## Pick up here

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

- **Vercel now auto-deploys.** Connected to `johnnkang/HandyCap` on 2026-09-07,
  production branch `main`, verified against the Vercel API. The earlier
  `vercel git connect` failures were the Vercel GitHub App not being installed
  for the `johnnkangs-projects` team; installing it from the Vercel dashboard
  fixed it and the CLI then reported the repo already connected. Pushes to `main`
  deploy on their own — `npx vercel --prod` is no longer needed.
- **UI component tests.** The app state, index screen, rounds screen, posting
  flow, record strip and explanation disclosures are covered — 196 tests, up
  from 155. The posting tests were mutation-checked: breaking the save and
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
