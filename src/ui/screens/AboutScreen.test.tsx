import { describe, expect, test } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithState } from '@/test/ui'
import { AboutScreen } from './AboutScreen'

const noop = () => {}

describe('AboutScreen', () => {
  test('shows no account entry point when accounts are unavailable', async () => {
    await renderWithState(
      <AboutScreen onClose={noop} onOpenAccount={noop} onOpenPrivacy={noop} />,
      { accountsAvailable: false },
    )
    await screen.findByText(/about handycap/i)
    expect(screen.queryByRole('button', { name: /^account$/i })).not.toBeInTheDocument()
  })

  test('shows the account entry point when accounts are available', async () => {
    await renderWithState(
      <AboutScreen onClose={noop} onOpenAccount={noop} onOpenPrivacy={noop} />,
      { accountsAvailable: true },
    )
    expect(await screen.findByRole('button', { name: /^account$/i })).toBeInTheDocument()
  })

  test('does not mention an account in the guest copy when accounts are unavailable', async () => {
    // The button is gone (covered above), but the guest paragraph itself
    // used to invite adding an account too — that invitation has to go with
    // it, or the copy points at a feature the gate just removed.
    await renderWithState(
      <AboutScreen onClose={noop} onOpenAccount={noop} onOpenPrivacy={noop} />,
      { accountsAvailable: false },
    )
    await screen.findByText(/only on this device/i)
    expect(screen.queryByText(/account/i)).not.toBeInTheDocument()
  })
})
