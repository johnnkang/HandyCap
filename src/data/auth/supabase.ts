import { supabaseClient } from '@/data/sync/supabase'
import type { Account, AuthClient } from './auth'

type SessionUser = { id: string; email?: string | null }

const toAccount = (user: SessionUser | null | undefined): Account | null =>
  user && user.email ? { id: user.id, email: user.email } : null

export function createSupabaseAuth(): AuthClient {
  return {
    async currentAccount() {
      const supabase = await supabaseClient()
      const { data } = await supabase.auth.getSession()
      return toAccount(data.session?.user)
    },

    async sendMagicLink(email) {
      const supabase = await supabaseClient()
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/` },
      })
      if (error) throw new Error(error.message)
    },

    async completeSignIn() {
      // detectSessionInUrl consumes the callback fragment on load, so this
      // only has to read back whatever session resulted.
      const supabase = await supabaseClient()
      const { data } = await supabase.auth.getSession()
      return toAccount(data.session?.user)
    },

    async signOut() {
      const supabase = await supabaseClient()
      await supabase.auth.signOut()
    },

    async deleteAccount() {
      const supabase = await supabaseClient()
      const { error } = await supabase.rpc('delete_own_account')
      if (error) throw new Error(error.message)
      await supabase.auth.signOut()
    },

    onChange(listener) {
      let unsubscribe = () => {}
      void supabaseClient().then((supabase) => {
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
          listener(toAccount(session?.user))
        })
        unsubscribe = () => data.subscription.unsubscribe()
      })
      return () => unsubscribe()
    },
  }
}
