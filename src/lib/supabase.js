import { createClient } from '@supabase/supabase-js'

const url  = import.meta.env.VITE_SUPABASE_URL
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.warn('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — cloud sync disabled')
}

export const supabase = (url && key) ? createClient(url, key) : null
