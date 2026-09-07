import { describe, expect, test, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PostRoundScreen } from './PostRoundScreen'
import { renderWithState, stubCourses } from '@/test/ui'
import { neutralTee, testHoles } from '@/test/fixtures'
import type { CourseSummary } from '@/data/opengolf/map'

const ranchoPark: CourseSummary = {
  id: 'c1',
  name: 'Rancho Park',
  city: 'Los Angeles',
  state: 'CA',
  par: 72,
  type: null,
}

/** A course that resolves to one neutral tee, so differentials are checkable by eye. */
const findable = (overrides = {}) =>
  stubCourses({
    searchCourses: async () => [ranchoPark],
    fetchTees: async () => [neutralTee()],
    fetchHoles: async () => ({ holes: testHoles(18), strokeIndexesEstimated: false }),
    ...overrides,
  })

/** Search, pick the course, pick the tee — the shared preamble of every path. */
async function reachSetup(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Course'), 'Rancho')
  await user.click(await screen.findByRole('button', { name: /Rancho Park/ }))
  await user.click(await screen.findByRole('button', { name: /White/ }))
}

describe('PostRoundScreen', () => {
  test('walks search to saved round, and the round reaches storage', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    const { repository } = await renderWithState(<PostRoundScreen onDone={onDone} />, {
      courses: findable(),
    })

    await reachSetup(user)
    await user.click(screen.getByRole('button', { name: 'Just the total' }))
    await user.click(screen.getByRole('button', { name: 'Enter the score' }))
    await user.type(screen.getByLabelText(/total score for 18 holes/i), '90')
    await user.click(screen.getByRole('button', { name: /post this round · 90/i }))

    const saved = await repository.loadRounds()
    expect(saved).toHaveLength(1)
    expect(saved[0]!.totalStrokes).toBe(90)
    expect(saved[0]!.course.name).toBe('Rancho Park')
    expect(onDone).toHaveBeenCalled()
  })

  test('previews what the round will score before it is committed', async () => {
    // Posting a score you cannot yet see the effect of is the thing GHIN does
    // and this app exists not to do.
    const user = userEvent.setup()
    await renderWithState(<PostRoundScreen onDone={vi.fn()} />, { courses: findable() })

    await reachSetup(user)
    await user.click(screen.getByRole('button', { name: 'Just the total' }))
    await user.click(screen.getByRole('button', { name: 'Enter the score' }))
    await user.type(screen.getByLabelText(/total score/i), '90')

    // 90 on a course rated 72.0 off slope 113 is a differential of 18.0.
    expect(await screen.findByText('18.0')).toBeInTheDocument()
    expect(screen.getByText(/90 adjusted on a 113 slope/i)).toBeInTheDocument()
  })

  test('will not save until there is a score to save', async () => {
    const user = userEvent.setup()
    await renderWithState(<PostRoundScreen onDone={vi.fn()} />, { courses: findable() })

    await reachSetup(user)
    await user.click(screen.getByRole('button', { name: 'Just the total' }))
    await user.click(screen.getByRole('button', { name: 'Enter the score' }))

    expect(screen.getByRole('button', { name: /enter every hole to save/i })).toBeDisabled()
  })

  test('warns that a total-only round gives up the cap and the breakdown', async () => {
    const user = userEvent.setup()
    await renderWithState(<PostRoundScreen onDone={vi.fn()} />, { courses: findable() })

    await reachSetup(user)
    await user.click(screen.getByRole('button', { name: 'Just the total' }))

    expect(screen.getByText(/cannot be capped at net double bogey/i)).toBeInTheDocument()
  })

  test('explains what happens to a lone nine before one is posted', async () => {
    const user = userEvent.setup()
    await renderWithState(<PostRoundScreen onDone={vi.fn()} />, { courses: findable() })

    await reachSetup(user)
    await user.click(screen.getByRole('button', { name: '9 holes' }))

    expect(screen.getByText(/waits for a second one/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'front nine' })).toBeInTheDocument()
  })

  test('says a course cannot be used when it has no rated tees', async () => {
    // Without a rating and slope there is no lawful differential, so the app
    // has to say why rather than offering a dead "start scoring" button.
    const user = userEvent.setup()
    await renderWithState(<PostRoundScreen onDone={vi.fn()} />, {
      courses: findable({ fetchTees: async () => [] }),
    })

    await user.type(await screen.findByLabelText('Course'), 'Rancho')
    await user.click(await screen.findByRole('button', { name: /Rancho Park/ }))

    expect(await screen.findByText(/no rated tees are on record/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start scoring' })).toBeDisabled()
  })

  test('offers a hand-entered course when the search finds nothing', async () => {
    const user = userEvent.setup()
    await renderWithState(<PostRoundScreen onDone={vi.fn()} />, {
      courses: stubCourses({ searchCourses: async () => [] }),
    })

    await user.type(await screen.findByLabelText('Course'), 'Nowhere')

    expect(await screen.findByText(/no courses matched that name/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enter a course by hand/i })).toBeInTheDocument()
  })

  test('keeps the player moving when the course lookup fails', async () => {
    // Offline at the first tee is the normal case, not the edge case.
    const user = userEvent.setup()
    await renderWithState(<PostRoundScreen onDone={vi.fn()} />, {
      courses: stubCourses({
        searchCourses: async () => {
          throw new Error('Network unavailable.')
        },
      }),
    })

    await user.type(await screen.findByLabelText('Course'), 'Rancho')

    expect(await screen.findByText(/you can still enter a course by hand/i)).toBeInTheDocument()
  })
})
