import { describe, expect, test } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithState } from '@/test/ui'
import { createMemoryAuth } from '@/data/auth/auth'
import { createMemoryRemote } from '@/data/sync/remote'
import { AccountScreen } from './AccountScreen'

describe('AccountScreen', () => {
  test('tells a guest their rounds are only on this device', async () => {
    await renderWithState(<AccountScreen />)
    expect(await screen.findByText(/only on this (phone|device)/i)).toBeInTheDocument()
  })

  test('sends a magic link and says to check email', async () => {
    const auth = createMemoryAuth()
    await renderWithState(<AccountScreen />, { auth, remoteFor: () => createMemoryRemote() })

    await userEvent.type(await screen.findByLabelText(/email/i), 'golfer@example.com')
    await userEvent.click(screen.getByRole('button', { name: /email me a link/i }))

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
    expect(auth.lastEmail()).toBe('golfer@example.com')
  })

  test('rejects an address that is obviously not one', async () => {
    await renderWithState(<AccountScreen />, { auth: createMemoryAuth() })
    await userEvent.type(await screen.findByLabelText(/email/i), 'nope')
    await userEvent.click(screen.getByRole('button', { name: /email me a link/i }))
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument()
  })

  test('shows the signed-in address once signed in', async () => {
    const auth = createMemoryAuth({ account: { id: 'acct-1', email: 'golfer@example.com' } })
    await renderWithState(<AccountScreen />, { auth, remoteFor: () => createMemoryRemote() })
    expect(await screen.findByText('golfer@example.com')).toBeInTheDocument()
  })
})
