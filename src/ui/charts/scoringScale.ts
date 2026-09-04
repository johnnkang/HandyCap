import type { ScoreDistribution } from '@/domain/stats/parTypeStats'

/**
 * Scoring outcomes are an ordered scale centred on par, not a set of distinct
 * categories — so they take a diverging ramp with par as the neutral midpoint,
 * green for under par and warm for over.
 *
 * Both ramps were checked with the palette validator against their own surface.
 * Dark passes CVD separation and the normal-vision floor outright. In light mode
 * the amber sits at 2.57:1 against white, a contrast WARN whose required relief
 * is visible labels — which is why every segment and legend entry carries its
 * count rather than relying on colour alone.
 */
export type ScoreClass = 'birdieOrBetter' | 'par' | 'bogey' | 'doubleBogey' | 'tripleOrWorse'

export const SCORE_CLASSES: ScoreClass[] = [
  'birdieOrBetter',
  'par',
  'bogey',
  'doubleBogey',
  'tripleOrWorse',
]

export const scoreClassLabel: Record<ScoreClass, string> = {
  birdieOrBetter: 'Birdie or better',
  par: 'Par',
  bogey: 'Bogey',
  doubleBogey: 'Double',
  tripleOrWorse: 'Triple+',
}

/** CSS custom property carrying this class's colour, themed in index.css. */
export const scoreClassColor: Record<ScoreClass, string> = {
  birdieOrBetter: 'var(--score-under)',
  par: 'var(--score-par)',
  bogey: 'var(--score-bogey)',
  doubleBogey: 'var(--score-double)',
  tripleOrWorse: 'var(--score-triple)',
}

/** Eagles are rare enough that golfers report "birdie or better" as one class. */
export function toCounts(distribution: ScoreDistribution): Record<ScoreClass, number> {
  return {
    birdieOrBetter: distribution.eagleOrBetter + distribution.birdie,
    par: distribution.par,
    bogey: distribution.bogey,
    doubleBogey: distribution.doubleBogey,
    tripleOrWorse: distribution.tripleOrWorse,
  }
}
