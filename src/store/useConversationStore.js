// ── Conversation Store ────────────────────────────────────────────────────────
// Persists per-agent chat history to IndexedDB.
// Keys are agent IDs. Messages are simplified (no binary data — file parts
// are stripped to text-only representations before saving).
//
// Max 50 messages per agent — oldest are dropped when the limit is exceeded.

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from '../utils/idbStorage.js'

const MAX_MESSAGES = 50

/**
 * Simplify a message object for storage — strip large binary data (base64
 * inline file parts) while keeping all text content intact.
 */
function simplifyMessage(msg) {
  return {
    id:          msg.id,
    role:        msg.role,
    displayText: msg.displayText || '',
    fileInfo:    msg.fileInfo || null,  // { name, size, type } — metadata only
    isError:     msg.isError || false,
    timestamp:   msg.timestamp || new Date().toISOString(),
    // Rebuild parts as text-only — binary data cannot be serialised into IDB
    // reliably across page loads; the file itself is gone anyway.
    parts: (msg.parts || [])
      .filter(p => p.text !== undefined)
      .map(p => ({ text: p.text })),
  }
}

export const useConversationStore = create(
  persist(
    (set, get) => ({
      // Map of agentId → SimpleMessage[]
      conversations: {},

      /** Load the stored messages for an agent (returns [] if none). */
      getMessages: (agentId) =>
        get().conversations[agentId] || [],

      /** Append a batch of messages for an agent, enforcing the cap. */
      saveMessages: (agentId, messages) => {
        const simple = messages.map(simplifyMessage)
        set(state => {
          const existing = state.conversations[agentId] || []
          const merged   = [...existing, ...simple]
          // Keep only the last MAX_MESSAGES to avoid unbounded growth
          const capped   = merged.slice(-MAX_MESSAGES)
          return {
            conversations: {
              ...state.conversations,
              [agentId]: capped,
            },
          }
        })
      },

      /** Replace the full conversation for an agent (used on full-load restore). */
      setMessages: (agentId, messages) => {
        const simple = messages.map(simplifyMessage)
        set(state => ({
          conversations: {
            ...state.conversations,
            [agentId]: simple.slice(-MAX_MESSAGES),
          },
        }))
      },

      /** Clear all messages for a specific agent. */
      clearMessages: (agentId) => {
        set(state => {
          const next = { ...state.conversations }
          delete next[agentId]
          return { conversations: next }
        })
      },

      /** Clear all conversations (nuclear option). */
      clearAll: () => set({ conversations: {} }),
    }),
    {
      name:    'agent-conversations-v1',
      storage: createJSONStorage(() => idbStorage),
    }
  )
)
