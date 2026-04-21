import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from '../utils/idbStorage.js'

/**
 * Knowledge Base store.
 * Each KB holds indexed documents with text chunks + embeddings (float arrays).
 * Stored in IndexedDB — handles the large payload (embeddings) without issue.
 *
 * Schema:
 *   knowledgeBases: [
 *     {
 *       id, name, description, folderName,
 *       docs: [
 *         { id, fileName, filePath, textLength, chunkCount,
 *           chunks: [{ text, embedding: number[] }],
 *           indexedAt }
 *       ],
 *       createdAt, updatedAt
 *     }
 *   ]
 */
export const useKnowledgeBaseStore = create(
  persist(
    (set, get) => ({
      knowledgeBases: [],

      addKnowledgeBase: ({ name, description = '' }) => {
        const kb = {
          id:          crypto.randomUUID(),
          name,
          description,
          folderName:  null,
          docs:        [],
          createdAt:   new Date().toISOString(),
          updatedAt:   new Date().toISOString(),
        }
        set(state => ({ knowledgeBases: [...state.knowledgeBases, kb] }))
        return kb
      },

      updateKnowledgeBase: (id, updates) =>
        set(state => ({
          knowledgeBases: state.knowledgeBases.map(kb =>
            kb.id === id ? { ...kb, ...updates, updatedAt: new Date().toISOString() } : kb
          ),
        })),

      removeKnowledgeBase: (id) =>
        set(state => ({
          knowledgeBases: state.knowledgeBases.filter(kb => kb.id !== id),
        })),

      // Add or replace all docs for a KB (used after full folder index)
      setDocs: (kbId, folderName, docs) =>
        set(state => ({
          knowledgeBases: state.knowledgeBases.map(kb =>
            kb.id === kbId
              ? { ...kb, folderName, docs, updatedAt: new Date().toISOString() }
              : kb
          ),
        })),

      // Append docs (used when adding individual files)
      appendDocs: (kbId, newDocs) =>
        set(state => ({
          knowledgeBases: state.knowledgeBases.map(kb => {
            if (kb.id !== kbId) return kb
            const existingNames = new Set(kb.docs.map(d => d.fileName))
            const toAdd = newDocs.filter(d => !existingNames.has(d.fileName))
            return { ...kb, docs: [...kb.docs, ...toAdd], updatedAt: new Date().toISOString() }
          }),
        })),

      removeDoc: (kbId, docId) =>
        set(state => ({
          knowledgeBases: state.knowledgeBases.map(kb =>
            kb.id === kbId
              ? { ...kb, docs: kb.docs.filter(d => d.id !== docId), updatedAt: new Date().toISOString() }
              : kb
          ),
        })),

      getById: (id) => get().knowledgeBases.find(kb => kb.id === id) || null,
    }),
    {
      name:    'knowledge-base-v1',
      storage: createJSONStorage(() => idbStorage),
    }
  )
)
