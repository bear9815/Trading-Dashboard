import { create } from 'zustand'
import { supabase } from '../lib/supabase.js'

async function getUid() {
  const { useAuthStore } = await import('./useAuthStore.js')
  return useAuthStore.getState().user?.id
}

export const useResearchLibraryStore = create((set, get) => ({
  sources: [],
  loading: false,

  loadSources: async () => {
    if (!supabase) return
    const uid = await getUid()
    if (!uid) return
    set({ loading: true })
    const { data, error } = await supabase
      .from('research_sources')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[ResearchLibrary] loadSources:', error.message)
    } else {
      set({ sources: data || [] })
    }
    set({ loading: false })
  },

  addSource: async (source) => {
    if (!supabase) return null
    const uid = await getUid()
    if (!uid) return null
    const payload = {
      ...source,
      user_id:    uid,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('research_sources')
      .insert(payload)
      .select()
      .single()
    if (error) {
      console.error('[ResearchLibrary] addSource:', error.message)
      throw error
    }
    set(state => ({ sources: [data, ...state.sources] }))
    return data
  },

  updateSource: async (id, updates) => {
    if (!supabase) return
    const uid = await getUid()
    if (!uid) return
    const { data, error } = await supabase
      .from('research_sources')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', uid)
      .select()
      .single()
    if (error) {
      console.error('[ResearchLibrary] updateSource:', error.message)
      throw error
    }
    set(state => ({ sources: state.sources.map(s => s.id === id ? data : s) }))
    return data
  },

  removeSource: async (id) => {
    if (!supabase) return
    const uid = await getUid()
    if (!uid) return
    const { error } = await supabase
      .from('research_sources')
      .delete()
      .eq('id', id)
      .eq('user_id', uid)
    if (error) {
      console.error('[ResearchLibrary] removeSource:', error.message)
      throw error
    }
    set(state => ({ sources: state.sources.filter(s => s.id !== id) }))
  },
}))
