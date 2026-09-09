import { describe, expect, test } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithState } from '@/test/ui'
import { createMemoryAuth } from '@/data/auth/auth'
import { createMemoryRemote } from '@/data/sync/remote'
import { createMemoryStore } from '@/data/repo/store'
import { testRound } from '@/test/fixtures'
import { BackupNudge } from './BackupNudge'

const rounds = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    testRound({ id: `r${i}`, date: `2026-05-0${(i % 9) + 1}`, totalStrokes: 90 }),
  )

describe('BackupNudge', () => {
  test('stays quiet below five rounds', async () => {
    await renderWithState(<BackupNudge />, { rounds: rounds(4) })
    expect(screen.queryByText(/only on this (phone|device)/i)).not.toBeInTheDocument()
  })

  test('appears once the index means something', async () => {
    await renderWithState(<BackupNudge />, { rounds: rounds(5) })
    expect(await screen.findByText(/only on this (phone|device)/i)).toBeInTheDocument()
  })

  test('never appears for a signed-in golfer', async () => {
    await renderWithState(<BackupNudge />, {
      rounds: rounds(8),
      auth: createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } }),
      remoteFor: () => createMemoryRemote(),
    })
    expect(screen.queryByText(/only on this (phone|device)/i)).not.toBeInTheDocument()
  })

  test('stays dismissed once dismissed', async () => {
    // The dismissal flag lives in the injectable `store`, the same one sync
    // cursors use — not in `repository` — so both renders must share one for
    // the second mount to see the first mount's dismissal.
    const store = createMemoryStore()
    const { unmount, repository } = await renderWithState(<BackupNudge />, {
      rounds: rounds(6),
      store,
    })
    await userEvent.click(await screen.findByRole('button', { name: /no thanks/i }))
    expect(screen.queryByText(/only on this (phone|device)/i)).not.toBeInTheDocument()

    unmount()
    await renderWithState(<BackupNudge />, { rounds: rounds(6), repository, store })
    expect(screen.queryByText(/only on this (phone|device)/i)).not.toBeInTheDocument()
  })
})
