# Where HandyCap stands

Last updated 2026-09-07.

All three planned phases are complete, deployed, and green: **155 tests**,
typecheck clean, production build passing. Live at
https://handycap-psi.vercel.app

Everything in the original brief is built — per-course handicap, an overall index
across courses, forecasting from recent scores, full score history with average,
best and worst, and the Par 3/4/5 strengths analysis.

## Pick up here

**1. Check it against a real GHIN index.** This is the most valuable thing left
and the one thing the test suite cannot do. The numbers match hand calculation
and the published rules, but no round has been compared against an official
handicap. Post your last 20 rounds and compare — a gap would tell us something
155 tests cannot.

**2. Connect Vercel to GitHub** so pushes deploy automatically. `vercel link`
tried and failed because the Vercel GitHub app is not installed; `vercel git
connect` would finish it. Until then, deploy with `npx vercel --prod`.

## Done since

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

- UI screens are verified by driving the real app rather than by component tests.
  Only the scorecard and the chart layout have their own tests; the domain and
  data layers are thoroughly test-driven.
- PCC is treated as zero and nine-hole rounds are paired. Both are deliberate and
  explained in the README and in the app's About sheet.
- Not an official handicap. HandyCap is not a licensed provider.
