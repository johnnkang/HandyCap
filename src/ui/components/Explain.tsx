import { useId, useState } from 'react'
import { glossary, type GlossaryTerm } from '../glossary'

/**
 * A tap target that reveals what a number actually means.
 *
 * Beginner-friendliness in this app is progressive disclosure rather than
 * omission: the real term stays on screen, and the explanation is one tap away.
 */
export function Explain({ term, className = '' }: { term: GlossaryTerm; className?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()

  return (
    <span className={`inline-flex flex-col ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        aria-controls={id}
        className="tap inline-grid h-[18px] w-[18px] place-items-center rounded-full border text-[11px] leading-none"
        style={{
          borderColor: open ? 'var(--signal)' : 'var(--hairline-strong)',
          color: open ? 'var(--signal)' : 'var(--ink-faint)',
        }}
      >
        <span aria-hidden="true">?</span>
        <span className="sr-only">What does this mean?</span>
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className="prose-note rise absolute left-4 right-4 z-20 mt-7 rounded-xl border p-3"
          style={{
            background: 'var(--raised)',
            borderColor: 'var(--hairline-strong)',
            boxShadow: 'var(--shadow-lift)',
          }}
        >
          {glossary[term]}
        </span>
      )}
    </span>
  )
}
