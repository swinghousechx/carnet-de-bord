import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '../env'

export const supabase: SupabaseClient | null =
  env.supabaseUrl && env.supabaseKey
    ? createClient(env.supabaseUrl, env.supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'carnet-de-bord-auth' },
      })
    : null
