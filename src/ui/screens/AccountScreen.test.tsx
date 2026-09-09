import { describe, expect, test } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithState } from '@/test/ui'
import { createMemoryAuth } from '@/data/auth/auth'
import { createMemoryRemote } from '@/data/sync/remote'
import { testRound } from '@/test/fixtures'
import { AccountScreen } from './AccountScreen'

describe('AccountScreen', () => {
  test('tells a guest their rounds are only on this device', async () => {
    await renderWithState(<AccountScreen onClose={() => {}} />)
    expect(await screen.findByText(/only on this (phone|device)/i)).toBeInTheDocument()
  })

  test('sends a magic link and says to check email', async () => {
    const auth = createMemoryAuth()
    await renderWithState(<AccountScreen onClose={() => {}} />, {
      auth,
      remoteFor: () => createMemoryRemote(),
    })

    await userEvent.type(await screen.findByLabelText(/email/i), 'golfer@example.com')
    await userEvent.click(screen.getByRole('button', { name: /email me a link/i }))

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
    expect(auth.lastEmail()).toBe('golfer@example.com')
  })

  test('rejects an address that is obviously not one', async () => {
    await renderWithState(<AccountScreen onClose={() => {}} />, { auth: createMemoryAuth() })
    await userEvent.type(await screen.findByLabelText(/email/i), 'nope')
    await userEvent.click(screen.getByRole('button', { name: /email me a link/i }))
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument()
  })

  test('shows the signed-in address once signed in', async () => {
    const auth = createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } })
    await renderWithState(<AccountScreen onClose={() => {}} />, {
      auth,
      remoteFor: () => createMemoryRemote(),
    })
    expect(await screen.findByText('golfer@example.com')).toBeInTheDocument()
  })

  test('tells the user when sending the link fails, and leaves the form usable', async () => {
    const failing = {
      ...createMemoryAuth(),
      sendMagicLink: async () => {
        throw new Error('offline')
      },
    }
    await renderWithState(<AccountScreen onClose={() => {}} />, { auth: failing })

    const input = await screen.findByLabelText(/email/i)
    await userEvent.type(input, 'golfer@example.com')
    await userEvent.click(screen.getByRole('button', { name: /email me a link/i }))

    expect(
      await screen.findByText(/couldn't send the link/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toHaveValue('golfer@example.com')
    expect(screen.getByRole('button', { name: /email me a link/i })).toBeInTheDocument()
  })
})

describe('leaving', () => {
  const signedIn = () => createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } })

  test('signing out keeps the rounds on the device', async () => {
    const auth = signedIn()
    await renderWithState(<AccountScreen />, {
      auth,
      remoteFor: () => createMemoryRemote(),
      rounds: [testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 })],
    })

    await userEvent.click(await screen.findByRole('button', { name: /^sign out$/i }))

    expect(await screen.findByText(/only on this (phone|device)/i)).toBeInTheDocument()
    expect(await screen.findByText(/1 round is still on this device/i)).toBeInTheDocument()
  })

  test('offers a separate sign out that removes local data', async () => {
    const auth = signedIn()
    const { repository } = await renderWithState(<AccountScreen />, {
      auth,
      remoteFor: () => createMemoryRemote(),
      rounds: [testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 })],
    })

    await userEvent.click(await screen.findByRole('button', { name: /remove.*this device/i }))
    await userEvent.click(await screen.findByRole('button', { name: /yes, remove/i }))

    expect(await repository.loadRounds()).toEqual([])
  })

  test('deleting the account needs the email typed to confirm', async () => {
    const auth = signedIn()
    await renderWithState(<AccountScreen />, { auth, remoteFor: () => createMemoryRemote() })

    await userEvent.click(await screen.findByRole('button', { name: /delete my account/i }))
    const confirm = await screen.findByRole('button', { name: /permanently delete/i })
    expect(confirm).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/type your email/i), 'golfer@example.com')
    expect(confirm).toBeEnabled()
  })

  test('deleting the account leaves the local rounds alone', async () => {
    const auth = signedIn()
    const { repository } = await renderWithState(<AccountScreen />, {
      auth,
      remoteFor: () => createMemoryRemote(),
      rounds: [testRound({ id: 'a', date: '2026-05-01', totalStrokes: 90 })],
    })

    await userEvent.click(await screen.findByRole('button', { name: /delete my account/i }))
    await userEvent.type(screen.getByLabelText(/type your email/i), 'golfer@example.com')
    await userEvent.click(screen.getByRole('button', { name: /permanently delete/i }))

    expect(await screen.findByText(/only on this (phone|device)/i)).toBeInTheDocument()
    expect((await repository.loadRounds()).map((r) => r.id)).toEqual(['a'])
  })
})
