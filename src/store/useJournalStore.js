import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'

export const useJournalStore = create(
  persist(
    (set, get) => ({
      // ── Journal entries (existing) ─────────────────────────────────────────
      entries: [],

      addEntry: (entry) => set(s => ({
        entries: [{ ...entry, id: entry.id || uuidv4(), timestamp: entry.timestamp || new Date().toISOString() }, ...s.entries]
      })),

      addEntries: (newEntries) => set(s => {
        const existing = new Set(s.entries.map(e => e.id))
        const toAdd = newEntries
          .map(e => ({ ...e, id: e.id || uuidv4() }))
          .filter(e => !existing.has(e.id))
        return { entries: [...toAdd, ...s.entries] }
      }),

      updateEntry: (id, updates) => set(s => ({
        entries: s.entries.map(e => e.id === id ? { ...e, ...updates } : e)
      })),

      deleteEntry: (id) => set(s => ({
        entries: s.entries.filter(e => e.id !== id)
      })),

      getEntries: () => [...get().entries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),

      // ── Priorities — pinned focus areas ───────────────────────────────────
      // { id, label, description, color, order }
      priorities: [],

      addPriority: (p) => set(s => {
        const item = { ...p, id: p.id || uuidv4(), order: s.priorities.length }
        return { priorities: [...s.priorities, item] }
      }),

      updatePriority: (id, updates) => set(s => ({
        priorities: s.priorities.map(p => p.id === id ? { ...p, ...updates } : p)
      })),

      deletePriority: (id) => set(s => ({
        priorities: s.priorities.filter(p => p.id !== id)
      })),

      reorderPriorities: (orderedIds) => set(s => ({
        priorities: orderedIds
          .map((id, i) => ({ ...s.priorities.find(p => p.id === id), order: i }))
          .filter(Boolean)
      })),

      // ── Goals ─────────────────────────────────────────────────────────────
      // { id, title, area, description, status, priority, targetDate, notes, createdAt, updatedAt }
      // status: 'active' | 'completed' | 'paused'
      // priority: 'high' | 'medium' | 'low'
      goals: [],

      addGoal: (g) => set(s => {
        const now = new Date().toISOString()
        const item = { status: 'active', priority: 'medium', area: 'General', ...g, id: g.id || uuidv4(), createdAt: now, updatedAt: now }
        return { goals: [item, ...s.goals] }
      }),

      updateGoal: (id, updates) => set(s => ({
        goals: s.goals.map(g => g.id === id ? { ...g, ...updates, updatedAt: new Date().toISOString() } : g)
      })),

      deleteGoal: (id) => set(s => ({
        goals: s.goals.filter(g => g.id !== id)
      })),

      // ── Check-ins ─────────────────────────────────────────────────────────
      // { id, date (YYYY-MM-DD), onTrack, needsAttention, wins, goalProgress: [goalId], createdAt }
      checkins: [],

      addCheckin: (c) => set(s => {
        const item = { ...c, id: c.id || uuidv4(), createdAt: c.createdAt || new Date().toISOString() }
        return { checkins: [item, ...s.checkins] }
      }),

      deleteCheckin: (id) => set(s => ({
        checkins: s.checkins.filter(c => c.id !== id)
      })),
    }),
    { name: 'risk-tool-journal' }
  )
)
