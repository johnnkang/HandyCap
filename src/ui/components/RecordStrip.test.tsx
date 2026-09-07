import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecordStrip } from './RecordStrip'
import { buildScoringRecord } from '@/domain/whs/scoringRecord'
import { SCORING_RECORD_SIZE } from '@/domain/whs/handicapIndex'
import { scoresOfBogey, testRound } from '@/test/fixtures'
import type { Round } from '@/domain/whs/types'

/** `count` rounds a week apart, so ordering and the 20-slot window are exercised. */
function rounds(count: number, strokes = scoresOfBogey()): Round[] {
  return Array.from({ length: count }, (_, i) => {
    const day = String(i + 1).padStart(2, '0')
    return testRound({ id: `r${i}`, date: `2026-05-${day}`, strokes })
  })
}

const strip = (count: number) =>
  render(<RecordStrip record={buildScoringRecord(rounds(count))} />)

describe('RecordStrip', () => {
  test('always draws twenty slots, so the empty ones read as room to grow', () => {
    const { container } = strip(3)
    expect(container.querySelectorAll('.record-bar')).toHaveLength(SCORING_RECORD_SIZE)
    expect(container.querySelectorAll('[data-empty="true"]')).toHaveLength(
      SCORING_RECORD_SIZE - 3,
    )
  })

  test('reports how much of the record is filled', () => {
    strip(3)
    expect(screen.getByText(`3 of ${SCORING_RECORD_SIZE} scores`)).toBeInTheDocument()
  })

  test('marks the rounds currently counting toward the index', () => {
    // Eight of the last twenty count once the record is full.
    const { container } = strip(20)
    expect(container.querySelectorAll('[data-counting="true"]')).toHaveLength(8)
    expect(screen.getByText('8 counting')).toBeInTheDocument()
  })

  test('shows only the last twenty when more rounds exist', () => {
    const { container } = strip(25)
    expect(container.querySelectorAll('[data-empty="true"]')).toHaveLength(0)
    expect(screen.getByText(`${SCORING_RECORD_SIZE} of ${SCORING_RECORD_SIZE} scores`))
      .toBeInTheDocument()
  })

  test('describes the record for a screen reader, since the bars are decorative', () => {
    strip(20)
    expect(screen.getByRole('img')).toHaveAccessibleName(
      '20 scores in your record, of which the lowest 8 count toward your Handicap Index',
    )
  })

  test('says so plainly when nothing has been posted', () => {
    render(<RecordStrip record={buildScoringRecord([])} />)
    expect(screen.getByRole('img')).toHaveAccessibleName('No scores posted yet')
  })
})
