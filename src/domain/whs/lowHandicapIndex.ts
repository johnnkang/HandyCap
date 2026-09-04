const DAYS_IN_LOOKBACK = 365
const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface IndexHistoryEntry {
  /** ISO date, YYYY-MM-DD. */
  date: string
  index: number
}

/** Parse an ISO date as UTC midnight, so results never shift with the timezone. */
function parseDate(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`)
}

/**
 * Low Handicap Index (Rule 5.7): the lowest Handicap Index the player held in
 * the 365 days up to `asOf`. It is the anchor the soft and hard caps measure
 * against.
 *
 * Returns `null` when nothing falls inside the window.
 */
export function lowHandicapIndex(
  history: IndexHistoryEntry[],
  asOf: string,
): number | null {
  const asOfTime = parseDate(asOf)
  const earliest = asOfTime - DAYS_IN_LOOKBACK * MS_PER_DAY

  const inWindow = history.filter((entry) => {
    const time = parseDate(entry.date)
    return time >= earliest && time <= asOfTime
  })

  if (inWindow.length === 0) return null
  return Math.min(...inWindow.map((entry) => entry.index))
}
