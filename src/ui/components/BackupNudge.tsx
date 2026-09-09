import { useEffect, useState } from 'react'
import { useAppState } from '../state/AppState'

const DISMISSED_KEY = 'handycap:nudgeDismissed'

/**
 * An honest, inline offer to back up — never a modal, never a nag. Guest mode
 * is not a trial: this shows up once the Index means something (five rounds
 * is where the World Handicap System starts producing a real number rather
 * than a provisional one) and, once dismissed, stays gone for good.
 */
export function BackupNudge({ onOpenAccount = () => {} }: { onOpenAccount?: () => void }) {
  const { account, rounds, store } = useAppState()
  // Starts unknown rather than false, so a dismissal already on record never
  // gets a one-frame flash before the store answers.
  const [dismissed, setDismissed] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void store.get<boolean>(DISMISSED_KEY).then((value) => {
      if (!cancelled) setDismissed(Boolean(value))
    })
    return () => {
      cancelled = true
    }
  }, [store])

  if (account) return null
  if (rounds.length < 5) return null
  if (dismissed !== false) return null

  const dismiss = () => {
    setDismissed(true)
    void store.set(DISMISSED_KEY, true)
  }

  return (
    <section className="rise panel relative p-4" style={{ animationDelay: '20ms' }} role="status">
      <p className="prose-note">
        Your rounds live only on this phone. If you lose it, they're gone.
      </p>
      <div className="mt-3 flex gap-3">
        <button type="button" className="tap chip flex-1 py-3" onClick={onOpenAccount}>
          Back them up
        </button>
        <button type="button" className="tap chip flex-1 py-3" onClick={dismiss}>
          No thanks
        </button>
      </div>
    </section>
  )
}
