import { create } from 'zustand'
import { supabase } from '../lib/supabase.js'
import { LOCAL_ONLY_MODE } from '../lib/appMode.js'

function localOnlyAuthError() {
  return new Error('Local-only mode is enabled — cloud sign-in is unavailable.')
}

export const useAuthStore = create((set) => ({
  user:    null,
  session: null,
  loading: false,

  /** Called by App on auth state change */
  setSession: (session) => set({
    session,
    user:    session?.user ?? null,
    loading: false,
  }),

  signIn: async (email, password) => {
    if (LOCAL_ONLY_MODE) throw localOnlyAuthError()
    if (!supabase) throw new Error('Supabase not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },

  signUp: async (email, password) => {
    if (LOCAL_ONLY_MODE) throw localOnlyAuthError()
    if (!supabase) throw new Error('Supabase not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    return data
  },

  resetPassword: async (email) => {
    if (LOCAL_ONLY_MODE) throw localOnlyAuthError()
    if (!supabase) throw new Error('Supabase not configured')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) throw error
  },

  signOut: async () => {
    if (!LOCAL_ONLY_MODE && supabase) await supabase.auth.signOut()
    set({ user: null, session: null, loading: false })
  },
}))
