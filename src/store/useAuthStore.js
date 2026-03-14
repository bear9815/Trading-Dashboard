import { create } from 'zustand'
import { supabase } from '../lib/supabase.js'

export const useAuthStore = create((set) => ({
  user:    null,
  session: null,
  loading: true,   // true while we're checking the existing session on startup

  /** Called by App on auth state change */
  setSession: (session) => set({
    session,
    user:    session?.user ?? null,
    loading: false,
  }),

  signIn: async (email, password) => {
    if (!supabase) throw new Error('Supabase not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },

  signUp: async (email, password) => {
    if (!supabase) throw new Error('Supabase not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    return data
  },

  signOut: async () => {
    if (supabase) await supabase.auth.signOut()
    set({ user: null, session: null })
  },
}))
