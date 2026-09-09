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

export function AccountScreen({ onClose = () => {} }: { onClose?: () => void }) {
  const { account, syncStatus, syncNow, auth, rounds, signOut, deleteAccount } = useAppState()
  const [justSignedOutCount, setJustSignedOutCount] = useState<number | null>(null)

  const handleSignOut = async () => {
    const count = rounds.length
    await signOut({ wipeLocal: false })
    setJustSignedOutCount(count)
  }

  const handleSignOutAndRemove = async () => {
    await signOut({ wipeLocal: true })
  }

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
            roundCount={rounds.length}
            onSyncNow={syncNow}
            onSignOut={handleSignOut}
            onSignOutAndRemove={handleSignOutAndRemove}
            onDeleteAccount={deleteAccount}
          />
        ) : (
          <SignedOut
            onSendLink={(email) => auth.sendMagicLink(email)}
            justSignedOutCount={justSignedOutCount}
          />
        )}
      </div>
    </div>
  )
}

function SignedOut({
  onSendLink,
  justSignedOutCount = null,
}: {
  onSendLink: (email: string) => Promise<void>
  /** Set right after a plain sign-out, so the "still here" message survives
   * the swap from the signed-in view to this one. Null the rest of the time. */
  justSignedOutCount?: number | null
}) {
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
      {justSignedOutCount !== null && (
        <p className="prose-note mb-3" role="status" style={{ color: 'var(--ink-dim)' }}>
          {justSignedOutCount} round{justSignedOutCount === 1 ? '' : 's'}{' '}
          {justSignedOutCount === 1 ? 'is' : 'are'} still on this device.
        </p>
      )}
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
  roundCount,
  onSyncNow,
  onSignOut,
  onSignOutAndRemove,
  onDeleteAccount,
}: {
  email: string
  syncStatus: SyncStatus
  roundCount: number
  onSyncNow: () => Promise<void>
  onSignOut: () => Promise<void>
  onSignOutAndRemove: () => Promise<void>
  onDeleteAccount: () => Promise<void>
}) {
  const message = SYNC_MESSAGE[syncStatus]

  return (
    <>
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
          <button
            type="button"
            className="tap chip flex-1 py-3"
            onClick={() => void onSignOut()}
          >
            Sign out
          </button>
        </div>
      </section>

      <RemoveFromDevice roundCount={roundCount} onConfirm={onSignOutAndRemove} />
      <DeleteAccount email={email} onConfirm={onDeleteAccount} />
    </>
  )
}

/**
 * A separate, confirmed sign-out for a borrowed or shared phone — the one
 * case where wiping local data on the way out is the point rather than a
 * catastrophe. Kept visually distinct from the plain "Sign out" above so
 * neither is reachable by accident.
 */
function RemoveFromDevice({
  roundCount,
  onConfirm,
}: {
  roundCount: number
  onConfirm: () => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    setRemoving(true)
    setError(null)
    try {
      await onConfirm()
      // On success the account becomes null and this screen swaps to the
      // signed-out view, so there is no "after" state to reset here.
    } catch {
      // Telling someone a borrowed phone is clean when it is not is the one
      // failure this control cannot have — surface it and stay signed in.
      setError("Couldn't remove this device. Check your connection and try again.")
      setRemoving(false)
    }
  }

  return (
    <section>
      <p className="label mb-2">Borrowed or shared phone</p>
      <p className="prose-note mb-3">
        Sign out and also erase the {roundCount} round{roundCount === 1 ? '' : 's'} on this
        device. Use this only on a phone that isn't yours to keep.
      </p>
      {error && (
        <p className="prose-note mb-3" role="status" style={{ color: 'var(--amber)' }}>
          {error}
        </p>
      )}
      {confirming ? (
        <div className="flex gap-3">
          <button
            type="button"
            className="tap chip flex-1 py-3"
            disabled={removing}
            onClick={() => {
              setConfirming(false)
              setError(null)
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="tap flex-1 rounded-xl border py-3 text-sm"
            style={{ borderColor: 'var(--flag)', color: 'var(--flag)' }}
            disabled={removing}
            onClick={() => void confirm()}
          >
            {removing ? 'Removing…' : 'Yes, remove'}
          </button>
        </div>
      ) : (
        <button type="button" className="tap chip w-full py-3" onClick={() => setConfirming(true)}>
          Sign out and remove from this device
        </button>
      )}
    </section>
  )
}

/**
 * The account's actual deletion — server rows and the auth user, not a
 * mailto: link. Kept as its own distinct, deliberately plain-looking
 * "danger zone" rather than folded in with sign-out, and gated on typing the
 * account's own email so it can't be triggered by a stray tap.
 */
function DeleteAccount({
  email,
  onConfirm,
}: {
  email: string
  onConfirm: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase()

  const confirm = async () => {
    setDeleting(true)
    setError(null)
    try {
      await onConfirm()
    } catch {
      setError("Couldn't delete the account. Check your connection and try again.")
      setDeleting(false)
    }
  }

  return (
    <section className="rounded-xl border p-4" style={{ borderColor: 'var(--flag)' }}>
      <p className="label mb-2" style={{ color: 'var(--flag)' }}>
        Danger zone
      </p>
      {open ? (
        <div className="space-y-3">
          <p className="prose-note">
            This permanently deletes your account and every round synced to it. Rounds
            already on this device are kept, and HandyCap keeps working without an account.
          </p>
          <div>
            <label className="label mb-2 block" htmlFor="delete-confirm-email">
              Type your email to confirm
            </label>
            <input
              id="delete-confirm-email"
              className="field"
              type="text"
              inputMode="email"
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={email}
            />
          </div>
          {error && (
            <p className="prose-note" role="status" style={{ color: 'var(--amber)' }}>
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              className="tap chip flex-1 py-3"
              onClick={() => {
                setOpen(false)
                setTyped('')
                setError(null)
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="tap flex-1 rounded-xl border py-3 text-sm"
              style={{ borderColor: 'var(--flag)', color: 'var(--flag)' }}
              disabled={!matches || deleting}
              onClick={() => void confirm()}
            >
              {deleting ? 'Deleting…' : 'Permanently delete'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="tap w-full rounded-xl border py-3 text-sm"
          style={{ borderColor: 'var(--flag)', color: 'var(--flag)' }}
          onClick={() => setOpen(true)}
        >
          Delete my account
        </button>
      )}
    </section>
  )
}
