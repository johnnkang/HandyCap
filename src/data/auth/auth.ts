/**
 * Authentication, behind an interface with a fake.
 *
 * Email is the account identity. Magic link is the only credential in this
 * phase and is never removable — it is the recovery path for the passkey and
 * password credentials added later.
 */
export interface Account {
  id: string
  email: string
}

export interface AuthClient {
  /** The signed-in account, or null for a guest. */
  currentAccount(): Promise<Account | null>
  sendMagicLink(email: string): Promise<void>
  /** Consume a sign-in callback, if the current URL carries one. */
  completeSignIn(): Promise<Account | null>
  signOut(): Promise<void>
  /** Delete the account itself. Local data is untouched — it is still theirs. */
  deleteAccount(): Promise<void>
  onChange(listener: (account: Account | null) => void): () => void
}

export interface MemoryAuth extends AuthClient {
  /** Test-only: simulate the user clicking the emailed link. */
  deliverMagicLink(): void
  /** Test-only: the address the last link was sent to. */
  lastEmail(): string | null
}

/** A stable id per email, so two fakes agree about who a golfer is. */
const idFor = (email: string): string => `acct-${email.toLowerCase().replace(/[^a-z0-9]/g, '-')}`

export function createMemoryAuth({
  account = null,
}: { account?: Account | null } = {}): MemoryAuth {
  let current = account
  let pending: string | null = null
  let followed = false
  const listeners = new Set<(account: Account | null) => void>()

  const announce = () => listeners.forEach((listener) => listener(current))

  return {
    async currentAccount() {
      return current
    },
    async sendMagicLink(email) {
      pending = email
      followed = false
    },
    async completeSignIn() {
      if (!pending || !followed) return null
      current = { id: idFor(pending), email: pending }
      pending = null
      followed = false
      announce()
      return current
    },
    async signOut() {
      current = null
      announce()
    },
    async deleteAccount() {
      current = null
      announce()
    },
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    deliverMagicLink() {
      followed = true
    },
    lastEmail() {
      return pending
    },
  }
}
