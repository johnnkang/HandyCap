import { describe, expect, test } from 'vitest'
import { createMemoryAuth } from './auth'

describe('memory auth', () => {
  test('starts signed out', async () => {
    expect(await createMemoryAuth().currentAccount()).toBeNull()
  })

  test('signs in when the emailed link is followed', async () => {
    const auth = createMemoryAuth()
    await auth.sendMagicLink('golfer@example.com')
    expect(await auth.currentAccount()).toBeNull()

    auth.deliverMagicLink()
    const account = await auth.completeSignIn()

    expect(account?.email).toBe('golfer@example.com')
    expect(await auth.currentAccount()).toEqual(account)
  })

  test('gives the same account id for the same email', async () => {
    const first = createMemoryAuth()
    await first.sendMagicLink('golfer@example.com')
    first.deliverMagicLink()
    const a = await first.completeSignIn()

    const second = createMemoryAuth()
    await second.sendMagicLink('golfer@example.com')
    second.deliverMagicLink()
    const b = await second.completeSignIn()

    expect(a!.id).toBe(b!.id)
  })

  test('notifies listeners on sign in and sign out', async () => {
    const auth = createMemoryAuth()
    const seen: (string | null)[] = []
    auth.onChange((account) => seen.push(account?.email ?? null))

    await auth.sendMagicLink('golfer@example.com')
    auth.deliverMagicLink()
    await auth.completeSignIn()
    await auth.signOut()

    expect(seen).toEqual(['golfer@example.com', null])
  })

  test('signs out after the account is deleted', async () => {
    const auth = createMemoryAuth()
    await auth.sendMagicLink('golfer@example.com')
    auth.deliverMagicLink()
    await auth.completeSignIn()

    await auth.deleteAccount()
    expect(await auth.currentAccount()).toBeNull()
  })
})
