import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Scorecard } from './Scorecard'
import { testHoles } from '@/test/fixtures'
import type { HoleScore } from '@/domain/whs/types'

const blank = (count: number): HoleScore[] =>
  Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    strokes: null,
    putts: null,
    fairwayHit: null,
    greenInRegulation: null,
  }))

function Harness({ courseHandicap }: { courseHandicap: number | null }) {
  const holes = testHoles(18)
  const [scores, setScores] = useState(blank(18))
  return (
    <Scorecard
      holes={holes}
      scores={scores}
      courseHandicap={courseHandicap}
      onChange={setScores}
    />
  )
}

describe('Scorecard', () => {
  test('tells an established player where their strokes fall', () => {
    // Hole 1 of the test course has stroke index 1, so a 16 handicap gets a shot.
    render(<Harness courseHandicap={16} />)
    expect(screen.getByText('You get 1 stroke here')).toBeInTheDocument()
  })

  test('tells a player with no index yet what their maximum score is', () => {
    // "No stroke here" is meaningless before you have an index. What actually
    // applies is the par + 5 cap, so that is what the card must say.
    render(<Harness courseHandicap={null} />)
    expect(screen.getByText(/max score 9/i)).toBeInTheDocument()
  })

  test('caps a blow-up hole and explains the number that will count', async () => {
    const user = userEvent.setup()
    render(<Harness courseHandicap={0} />)

    // Hole 1 is a par 4, so a scratch player caps at 6.
    await user.click(screen.getByRole('button', { name: 'One more stroke' }))
    for (let i = 0; i < 5; i++) {
      await user.click(screen.getByRole('button', { name: 'One more stroke' }))
    }

    expect(screen.getByText(/for your handicap this hole counts as/i)).toBeInTheDocument()
  })
})
