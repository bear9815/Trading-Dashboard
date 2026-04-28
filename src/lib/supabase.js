import { createClient } from '@supabase/supabase-js'
import { LOCAL_ONLY_MODE } from './appMode.js'

const env = import.meta.env ?? {}
const url  = env.VITE_SUPABASE_URL
const key  = env.VITE_SUPABASE_ANON_KEY

if (LOCAL_ONLY_MODE) {
  console.info('[supabase] Local-only mode enabled — cloud sync disabled')
} else if (!url || !key) {
  console.warn('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — cloud sync disabled')
}

export const supabase = (!LOCAL_ONLY_MODE && url && key) ? createClient(url, key) : null
