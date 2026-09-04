# HandyCap

A World Handicap System calculator that shows its working.

Most handicap tools are either official but opaque (a number, no reasoning) or
friendly but wrong (a simple average that will never match your real index).
HandyCap does both: a genuinely correct WHS engine, with every number one tap
away from a plain-English explanation.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # the engine's test suite
npm run typecheck
npm run build
npm run preview    # the production build, with the service worker live
npm run icons      # regenerate the app icons
```

The service worker only runs against a real build, so test install and offline
behaviour with `npm run preview`, not `npm run dev`.

## Deploying

The app is a static build with an SPA rewrite; `vercel.json` is set up for it.

```bash
npx vercel login
npx vercel --prod
```

Installing to a phone home screen needs HTTPS, so it only works from a deployed
URL, not from localhost on your phone.

## How it is put together

```
src/
  domain/      pure TypeScript — no React, no network, no ambient clock
    whs/       the handicap engine (see below)
    stats/     par-type analysis, score summaries, shot stats
  data/
    opengolf/  course database client, schemas, response mapping
    repo/      IndexedDB persistence, course cache, export/import
  ui/          screens, components, hooks
```

`domain/` is the product; everything above it is replaceable. That boundary is
what would let this become a native app later without rewriting the maths.

## The engine

Implemented against the Rules of Handicapping:

- **Score Differential** (5.1a) — `(113 / Slope) × (AGS − Course Rating − PCC)`
- **Net double bogey** (3.1) — every hole capped at `par + 2 + strokes received`;
  `par + 5` before you have an index
- **Handicap Index** (5.2) — lowest 8 of the last 20, with the full Rule 5.2a
  table for shorter records, capped at 54.0
- **Low Handicap Index** (5.7) and the **soft/hard caps** (5.6)
- **Exceptional Score Reduction** (5.9)
- **Course and Playing Handicap** (6.1)

The record is *replayed* forward in time on every change, because the net double
bogey cap on any round depends on the Course Handicap you held when you played
it. That is also why every saved round stores a snapshot of the course, tee and
hole data it used: a differential must never change because someone edited the
upstream database.

### Two disclosed approximations

1. **PCC is treated as 0.** It requires every score posted at that course that
   day, which no consumer app can see.
2. **Nine-hole rounds are combined in pairs.** The 2024 revision converts a
   single nine using an "expected Score Differential" table the USGA has not
   published. HandyCap uses the previous official method and marks an unpaired
   nine as pending.

HandyCap is not a licensed handicap provider. It tracks your official index
closely; it does not replace it.

## Offline

The app shell, icons and fonts are precached, so HandyCap opens with no signal.
Courses you have looked at are kept in IndexedDB and stay selectable offline —
verified with the network genuinely disabled: the app loaded, the record was
intact, and a cached course still offered all of its rated tees.

Your rounds live only on this device. Export a JSON backup from the About sheet.

## Course data

[OpenGolfAPI](https://opengolfapi.org) — 32,000+ courses, free, no key required.
Course data is © OpenStreetMap contributors, ODbL 1.0, via OpenGolfAPI.

Because that data is community-sourced, a rating can be stale or wrong, so
manual course entry and rating override are first-class features rather than an
escape hatch. Unrated tees are hidden: a tee with no Course Rating and Slope
cannot produce a valid differential.
