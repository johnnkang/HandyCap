import type { Round } from '@/domain/whs/types'
import type { OutgoingRound, RemoteStore } from './remote'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** False in tests and in any build without credentials; the app stays guest-only. */
export const supabaseConfigured = (): boolean => Boolean(URL && ANON_KEY)

/**
 * The client is imported dynamically, the way `store.ts` imports idb-keyval, so
 * a guest never downloads auth code they do not use.
 *
 * The anon key ships in the bundle by design — it is a public key, and row
 * level security is what protects the data.
 */
let clientPromise: Promise<import('@supabase/supabase-js').SupabaseClient> | null = null

export function supabaseClient() {
  if (!URL || !ANON_KEY) throw new Error('Supabase is not configured.')
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL, ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  )
  return clientPromise
}

/** Normalised so every timestamp in the system is the same ISO-8601 UTC shape. */
const iso = (value: string): string => new Date(value).toISOString()

interface Row {
  round_id: string
  payload: Round | null
  updated_at: string
  deleted_at: string | null
  /** Server-assigned by the stamp_cursor trigger; never written by a client. */
  cursor: string
}

export function createSupabaseRemote(accountId: string): RemoteStore {
  return {
    async pull(since) {
      const supabase = await supabaseClient()
      let query = supabase
        .from('rounds')
        .select('round_id, payload, updated_at, deleted_at, cursor')
        .eq('user_id', accountId)
      if (since) query = query.gt('cursor', since)

      const { data, error } = await query.order('cursor', { ascending: true })
      if (error) throw new Error(error.message)

      return (data ?? []).map((row: Row) => ({
        roundId: row.round_id,
        payload: row.payload,
        updatedAt: iso(row.updated_at),
        deletedAt: row.deleted_at ? iso(row.deleted_at) : null,
        cursor: row.cursor,
      }))
    },

    async push(rows: OutgoingRound[]) {
      if (rows.length === 0) return
      const supabase = await supabaseClient()
      const { error } = await supabase.from('rounds').upsert(
        rows.map((row) => ({
          user_id: accountId,
          round_id: row.roundId,
          payload: row.payload,
          updated_at: row.updatedAt,
          deleted_at: row.deletedAt,
        })),
        { onConflict: 'user_id,round_id' },
      )
      if (error) throw new Error(error.message)
    },

    async deleteEverything() {
      const supabase = await supabaseClient()
      const { error } = await supabase.from('rounds').delete().eq('user_id', accountId)
      if (error) throw new Error(error.message)
    },
  }
}
