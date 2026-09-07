import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Explain } from './Explain'
import { glossary } from '../glossary'

describe('Explain', () => {
  test('keeps the explanation hidden until asked for', () => {
    render(<Explain term="handicapIndex" />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  test('reveals the plain-English meaning of the term on tap', async () => {
    const user = userEvent.setup()
    render(<Explain term="slope" />)

    await user.click(screen.getByRole('button', { name: /what does this mean/i }))

    expect(screen.getByRole('note')).toHaveTextContent(glossary.slope)
  })

  test('closes again on a second tap', async () => {
    const user = userEvent.setup()
    render(<Explain term="slope" />)
    const trigger = screen.getByRole('button', { name: /what does this mean/i })

    await user.click(trigger)
    await user.click(trigger)

    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  test('announces its state to a screen reader', async () => {
    // The trigger is a bare "?" glyph, so the accessible name and the
    // expanded state are the only things a non-visual user has to go on.
    const user = userEvent.setup()
    render(<Explain term="pcc" />)
    const trigger = screen.getByRole('button', { name: /what does this mean/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAttribute('aria-controls', screen.getByRole('note').id)
  })
})
