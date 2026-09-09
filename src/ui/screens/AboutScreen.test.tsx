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
})
