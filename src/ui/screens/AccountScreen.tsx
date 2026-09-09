import { useState, type FormEvent } from 'react'
import { useAppState, type SyncStatus } from '../state/AppState'

/** Rejects anything without an `@` and a dot somewhere after it. */
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

const SYNC_MESSAGE: Record<SyncStatus, string> = {
  guest: 'Everything is backed up',
  idle: 'Everything is backed up',
  syncing: 'Syncing…',
  offline: 'Offline — your rounds are safe on this device',
  error: "Couldn't reach the server. Your rounds are safe on this device.",
}

export function AccountScreen({ onClose }: { onClose: () => void }) {
  const { account, syncStatus, syncNow, auth } = useAppState()

  return (
    <div
      className="fixed inset-0 z-30 overflow-y-auto"
      style={{ background: 'var(--ground)' }}
      role="dialog"
      aria-label="Account"
    >
      <div className="mx-auto max-w-[560px] space-y-7 px-4 pb-16 pt-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="tap grid h-9 w-9 place-items-center rounded-lg border"
            style={{ borderColor: 'var(--hairline)' }}
            aria-label="Close"
          >
            ✕
          </button>
          <h2 style={{ fontVariationSettings: "'wght' 620" }}>Account</h2>
        </div>

        {account ? (
          <SignedIn
            email={account.email}
            syncStatus={syncStatus}
            onSyncNow={syncNow}
            onSignOut={() => auth.signOut()}
          />
        ) : (
          <SignedOut onSendLink={(email) => auth.sendMagicLink(email)} />
        )}
      </div>
    </div>
  )
}

function SignedOut({ onSendLink }: { onSendLink: (email: string) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = email.trim()
    if (!isValidEmail(trimmed)) {
      setError('Enter a valid email address.')
      return
    }
    setError(null)
    setSending(true)
    try {
      await onSendLink(trimmed)
      setSentTo(trimmed)
    } catch {
      setError("Couldn't send the link. Check your connection and try again.")
    } finally {
      setSending(false)
    }
  }

  if (sentTo) {
    return (
      <section>
        <p className="prose-note" role="status">
          Check your email — we sent a link to {sentTo}.
        </p>
        <button
          type="button"
          className="tap chip mt-3"
          onClick={() => {
            setSentTo(null)
            setEmail('')
          }}
        >
          Use a different address
        </button>
      </section>
    )
  }

  return (
    <section>
      <p className="prose-note mb-4">
        Your rounds live only on this phone. If you lose it, they're gone. An account backs
        them up and keeps them in sync across your devices — it's optional, and everything
        works fine without one.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label mb-2 block" htmlFor="account-email">
            Email
          </label>
          <input
            id="account-email"
            className="field"
            type="text"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>
        {error && (
          <p className="prose-note" role="status" style={{ color: 'var(--amber)' }}>
            {error}
          </p>
        )}
        <button type="submit" className="primary-action tap w-full py-4" disabled={sending}>
          {sending ? 'Sending…' : 'Email me a link'}
        </button>
      </form>
    </section>
  )
}

function SignedIn({
  email,
  syncStatus,
  onSyncNow,
  onSignOut,
}: {
  email: string
  syncStatus: SyncStatus
  onSyncNow: () => Promise<void>
  onSignOut: () => Promise<void>
}) {
  const message = SYNC_MESSAGE[syncStatus]

  return (
    <section>
      <p className="label mb-2">Signed in as</p>
      <p className="prose-note mb-4">{email}</p>

      <p className="prose-note mb-4" style={{ color: 'var(--ink-dim)' }}>
        {message}
      </p>

      <div className="flex gap-3">
        <button
          type="button"
          className="tap chip flex-1 py-3"
          disabled={syncStatus === 'syncing'}
          onClick={() => void onSyncNow()}
        >
          Sync now
        </button>
        <button type="button" className="tap chip flex-1 py-3" onClick={() => void onSignOut()}>
          Sign out
        </button>
      </div>
    </section>
  )
}
