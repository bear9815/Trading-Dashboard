// ── Agent Chat ────────────────────────────────────────────────────────────────
// Full Gem-style chat interface for any stored agent.
// Supports multi-turn conversation, PDF/audio file drops, streaming output,
// conversation memory (persisted to IDB), web search, and SEC EDGAR tools.

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ArrowLeft, Send, Paperclip, X, Mic, FileText,
  Loader2, AlertTriangle, RotateCcw, Globe, Building2,
} from 'lucide-react'
import { useSettingsStore }         from '../../store/useSettingsStore.js'
import { useConversationStore }     from '../../store/useConversationStore.js'
import { AGENT_COLORS }             from '../../store/useAgentsStore.js'
import {
  isAudioFile, resolvedMimeType,
  uploadToGeminiFiles, waitForFileActive,
  readFileAsBase64,
} from '../../utils/thematicGemini.js'
import { extractPdfText } from '../../utils/pdfText.js'
import { ollamaChatStream } from '../../utils/ollama.js'
import { braveSearch, formatSearchResults }     from '../../utils/webSearch.js'
import { searchEdgarFilings, formatEdgarResults, extractTickers } from '../../utils/secEdgar.js'

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(n) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// Convert our internal message history to Gemini contents array
function buildGeminiHistory(messages) {
  return messages
    .filter(m => !m.isError)
    .map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: m.parts.length ? m.parts : [{ text: m.displayText || '' }],
    }))
}

// Convert our internal message history to OpenRouter messages array
function buildORHistory(messages) {
  return messages
    .filter(m => !m.isError)
    .map(m => ({
      role:    m.role === 'assistant' ? 'assistant' : 'user',
      content: m.parts.filter(p => p.text).map(p => p.text).join('\n') || '[file]',
    }))
}

// ── Gemini streaming chat ─────────────────────────────────────────────────────
async function callGeminiStream(apiKey, model, systemInstruction, geminiContents, onChunk) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: geminiContents,
        generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gemini error ${res.status}`)
  }

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let   buffer  = ''
  let   full    = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE: each complete event ends with \n\n
    const events = buffer.split('\n\n')
    buffer = events.pop()  // keep incomplete tail

    for (const event of events) {
      for (const line of event.split('\n')) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') continue
        try {
          const json  = JSON.parse(payload)
          const parts = json.candidates?.[0]?.content?.parts || []
          const chunk = parts
            .filter(p => !p.thought)
            .map(p => p.text || '')
            .join('')
          if (chunk) {
            full += chunk
            onChunk(chunk)
          }
        } catch { /* malformed chunk — skip */ }
      }
    }
  }

  return full
}

// ── OpenRouter chat (non-streaming) ──────────────────────────────────────────
async function callOpenRouterChat(apiKey, model, systemInstruction, orMessages) {
  const safeKey = (apiKey || '').replace(/[^\x20-\x7E]/g, '').trim()
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${safeKey}`,
      'HTTP-Referer':  window.location.origin,
      'X-Title':       'Trading Dashboard - Agent Chat',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        ...orMessages,
      ],
      temperature: 0.2,
      max_tokens:  4096,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || `OpenRouter error ${res.status}`
    // Google models routed through OpenRouter hit Google's capacity limits, not OpenRouter's.
    // Paying OpenRouter doesn't guarantee Google-side capacity.
    if (model?.startsWith('google/') && (msg.toLowerCase().includes('overload') || msg.toLowerCase().includes('capacity') || msg.toLowerCase().includes('high demand') || res.status === 529)) {
      throw new Error(`Google's servers are at capacity right now. This isn't an OpenRouter billing issue — you're paying OpenRouter but Google controls the quota. Fix: switch to Gemini Cloud provider in Agent Studio (uses your Gemini API key directly).`)
    }
    throw new Error(msg)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}

// ── Prepare file parts for a user message ────────────────────────────────────
// For Gemini agents  → returns inlineData / fileData parts (Gemini-native format)
// For OpenRouter     → extracts text from PDFs via Gemini so OR models can read it
async function prepareFileParts(file, geminiApiKey, onStatus, agentProvider = 'gemini') {
  if (isAudioFile(file)) {
    if (agentProvider === 'local') {
      throw new Error('Local agents do not support audio files yet. Use Gemini for audio/transcript analysis.')
    }
    // Audio always uses Gemini Files API regardless of agent provider
    if (!geminiApiKey) throw new Error('Gemini API key required for audio files. Add it in Settings → API Keys.')
    onStatus('Uploading audio…')
    const uploaded = await uploadToGeminiFiles(file, geminiApiKey)
    onStatus('Processing audio…')
    const active = await waitForFileActive(uploaded, geminiApiKey)
    return [{ fileData: { mimeType: resolvedMimeType(file), fileUri: active.uri } }]
  }

  // OpenRouter has no native PDF API — extract text via Gemini and return as text part
  if (agentProvider === 'openrouter') {
    if (!geminiApiKey) throw new Error('A Gemini API key is needed to read PDF content for OpenRouter agents. Add it in Settings → API Keys.')
    onStatus('Reading document…')
    const base64 = await readFileAsBase64(file)
    const extractBody = JSON.stringify({
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType: 'application/pdf', data: base64 } },
        { text: 'Return the full verbatim text of this document. Return only the text, no commentary.' },
      ]}],
      generationConfig: { maxOutputTokens: 16384, temperature: 0 },
    })
    let lastErr
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt))
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: extractBody }
      )
      if (res.ok) {
        const data = await res.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
        if (!text) throw new Error('Could not extract text from this PDF.')
        return [{ text: `[DOCUMENT: ${file.name}]\n\n${text}` }]
      }
      const err = await res.json().catch(() => ({}))
      const msg = err?.error?.message || `PDF text extraction failed (${res.status})`
      if (res.status !== 429 && res.status !== 503) throw new Error(msg)
      onStatus(`Gemini busy, retrying… (${attempt + 1}/3)`)
      lastErr = new Error(msg)
    }
    throw lastErr
  }

  if (agentProvider === 'local') {
    onStatus('Reading document…')
    const text = await extractPdfText(file, 30000)
    if (!text) throw new Error('Could not extract text from this PDF.')
    return [{ text: `[DOCUMENT: ${file.name}]\n\n${text}` }]
  }

  // Gemini — inline base64 (Gemini reads PDFs natively)
  onStatus('Reading file…')
  const base64   = await readFileAsBase64(file)
  const mimeType = file.type || 'application/pdf'
  return [{ inlineData: { mimeType, data: base64 } }]
}

// ── Run enabled tools before the LLM call ────────────────────────────────────
// Returns an array of context strings to prepend to the system instruction.
async function runTools(agent, messageText, braveApiKey, onStatus) {
  const contexts = []

  // Web search
  if (agent.tools?.webSearch && braveApiKey) {
    try {
      onStatus('Searching the web…')
      const results = await braveSearch(messageText, braveApiKey, 5)
      if (results.length) contexts.push(formatSearchResults(results, messageText))
    } catch (e) {
      console.warn('[AgentChat] Web search failed:', e.message)
    }
  }

  // SEC EDGAR
  if (agent.tools?.secEdgar) {
    try {
      const tickers = extractTickers(messageText)
      const query   = tickers.length ? tickers.join(' ') : messageText.slice(0, 100)
      onStatus('Searching SEC EDGAR…')
      const filings = await searchEdgarFilings(query, ['10-K', '10-Q', '8-K'], 365, 5)
      if (filings.length) contexts.push(formatEdgarResults(filings, query))
    } catch (e) {
      console.warn('[AgentChat] EDGAR search failed:', e.message)
    }
  }

  return contexts
}

// ── Tool indicator badges ─────────────────────────────────────────────────────
function ToolBadge({ icon: Icon, label, active }) {
  if (!active) return null
  return (
    <span className="flex items-center gap-1 text-[10px] text-gray-600 border border-white/[0.06] rounded-full px-2 py-0.5 bg-white/[0.02]">
      <Icon size={9} />
      {label}
    </span>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, agentColors }) {
  const isUser = msg.role === 'user'

  // Simple markdown-ish rendering: bold, code blocks, line breaks
  function renderText(text) {
    if (!text) return null
    const lines = text.split('\n')
    return lines.map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>
        }
        const codeParts = part.split(/(`[^`]+`)/g).map((cp, k) => {
          if (cp.startsWith('`') && cp.endsWith('`')) {
            return <code key={k} className="bg-white/[0.08] rounded px-1 py-0.5 text-[11px] font-mono">{cp.slice(1, -1)}</code>
          }
          return cp
        })
        return <span key={j}>{codeParts}</span>
      })
      return (
        <span key={i}>
          {parts}
          {i < lines.length - 1 && <br />}
        </span>
      )
    })
  }

  const filePartInfo = msg.fileInfo
  const textPart     = msg.displayText

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-5`}>

      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold mt-0.5
        ${isUser
          ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
          : `${agentColors.bg} ${agentColors.text} border ${agentColors.border}`}`
      }>
        {isUser ? 'You' : 'AI'}
      </div>

      {/* Bubble */}
      <div className={`max-w-[80%] space-y-2 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>

        {/* File chip */}
        {filePartInfo && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs
            ${isUser
              ? 'bg-accent-blue/10 border-accent-blue/20 text-accent-blue'
              : 'bg-white/[0.04] border-white/10 text-gray-400'}`
          }>
            {isAudioFile({ name: filePartInfo.name, type: filePartInfo.type })
              ? <Mic size={12} />
              : <FileText size={12} />
            }
            <span className="font-medium truncate max-w-[200px]">{filePartInfo.name}</span>
            <span className="text-[10px] opacity-60">{formatBytes(filePartInfo.size)}</span>
          </div>
        )}

        {/* Text */}
        {textPart && (
          <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed
            ${isUser
              ? 'bg-accent-blue/20 text-gray-100 border border-accent-blue/20 rounded-tr-sm'
              : msg.isError
                ? 'bg-red-500/10 text-red-300 border border-red-500/20'
                : 'bg-white/[0.05] text-gray-200 border border-white/10 rounded-tl-sm'
            }`
          }>
            {msg.isError
              ? <span className="flex items-center gap-2"><AlertTriangle size={13} />{textPart}</span>
              : renderText(textPart)
            }
          </div>
        )}

        {/* Streaming cursor */}
        {msg.streaming && (
          <div className="flex items-center gap-1.5 px-4 py-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:300ms]" />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AgentChat({ agent, onBack }) {
  // Store field is 'apiKey' for Gemini — not 'geminiApiKey'
  const { apiKey: geminiApiKey, openRouterApiKey, braveSearchApiKey } = useSettingsStore()
  const { getMessages, saveMessages, clearMessages } = useConversationStore()
  const colors = AGENT_COLORS[agent.color] || AGENT_COLORS.blue

  const [messages,    setMessages]    = useState(() => getMessages(agent.id))
  const [input,       setInput]       = useState('')
  const [pendingFile, setPendingFile] = useState(null)   // File object
  const [sending,     setSending]     = useState(false)
  const [statusText,  setStatusText]  = useState('')

  const bottomRef   = useRef(null)
  const inputRef    = useRef(null)
  const fileRef     = useRef(null)
  const dropZoneRef = useRef(null)

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  // Persist messages to IDB whenever they change (skip ephemeral streaming states)
  useEffect(() => {
    const stable = messages.filter(m => !m.streaming)
    if (stable.length > 0) {
      useConversationStore.getState().setMessages(agent.id, stable)
    }
  }, [messages, agent.id])

  // ── Drag-and-drop ─────────────────────────────────────────────────────────
  const handleDragOver = useCallback(e => { e.preventDefault() }, [])
  const handleDrop     = useCallback(e => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) setPendingFile(file)
  }, [])

  // ── Send message ──────────────────────────────────────────────────────────
  async function handleSend() {
    const text = input.trim()
    if (!text && !pendingFile) return
    if (sending) return

    const apiKey = geminiApiKey

    setSending(true)
    setInput('')
    const fileSnapshot = pendingFile
    setPendingFile(null)

    // Build the user message parts
    let fileParts  = []
    let fileInfo   = null

    if (fileSnapshot) {
      fileInfo = { name: fileSnapshot.name, size: fileSnapshot.size, type: fileSnapshot.type }
      try {
        fileParts = await prepareFileParts(fileSnapshot, apiKey, setStatusText, agent.provider)
      } catch (e) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(), role: 'assistant',
          parts: [{ text: e.message }],
          displayText: e.message, fileInfo: null, isError: true,
        }])
        setSending(false)
        setStatusText('')
        return
      }
    }

    const textPart   = text || (fileSnapshot ? 'Analyze this file.' : '')
    const userParts  = [...fileParts, { text: textPart }]

    const userMsg = {
      id: crypto.randomUUID(), role: 'user',
      parts: userParts, displayText: textPart, fileInfo,
      isError: false, timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])

    // Placeholder assistant message for streaming
    const assistantId = crypto.randomUUID()
    setMessages(prev => [...prev, {
      id: assistantId, role: 'assistant',
      parts: [], displayText: '', fileInfo: null,
      isError: false, streaming: true,
    }])

    setStatusText('Thinking…')

    try {
      // Run tools if enabled — inject context before the LLM call
      const toolContexts = await runTools(agent, textPart, braveSearchApiKey, setStatusText)

      // Build system prompt: base instructions + any tool context
      let systemPrompt = agent.instructions || ''
      if (toolContexts.length) {
        systemPrompt = `${systemPrompt}\n\n${toolContexts.join('\n\n')}`
      }

      setStatusText('Thinking…')

      if (agent.provider === 'openrouter') {
        if (!openRouterApiKey) throw new Error('OpenRouter API key required. Add it in Settings.')
        const orHistory = buildORHistory([...messages, userMsg])
        const reply     = await callOpenRouterChat(openRouterApiKey, agent.model, systemPrompt, orHistory)
        const assistantMsg = {
          id: assistantId, role: 'assistant',
          parts: [{ text: reply }], displayText: reply,
          fileInfo: null, isError: false, streaming: false,
          timestamp: new Date().toISOString(),
        }
        setMessages(prev => prev.map(m => m.id === assistantId ? assistantMsg : m))
      } else if (agent.provider === 'local') {
        const localHistory = buildORHistory([...messages, userMsg])
        await ollamaChatStream({
          model: agent.model || 'gemma2',
          messages: [
            { role: 'system', content: systemPrompt },
            ...localHistory,
          ],
          temperature: 0.2,
          onChunk: (fullText) => {
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? { ...m, parts: [{ text: fullText }], displayText: fullText }
                : m
            ))
          },
        })
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, streaming: false, timestamp: new Date().toISOString() }
            : m
        ))
      } else {
        // Gemini streaming
        const history = buildGeminiHistory([...messages, userMsg])
        if (!apiKey) throw new Error('Gemini API key required. Add it in Settings → API Keys.')
        let accumulated = ''
        await callGeminiStream(apiKey, agent.model || 'gemini-2.5-flash', systemPrompt, history,
          (chunk) => {
            accumulated += chunk
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? { ...m, parts: [{ text: accumulated }], displayText: accumulated }
                : m
            ))
          }
        )
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, streaming: false, timestamp: new Date().toISOString() }
            : m
        ))
      }
    } catch (e) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, parts: [{ text: e.message }], displayText: e.message, isError: true, streaming: false }
          : m
      ))
    } finally {
      setSending(false)
      setStatusText('')
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleClearChat() {
    if (messages.length > 0 && !confirm('Clear this conversation? This cannot be undone.')) return
    setMessages([])
    clearMessages(agent.id)
    inputRef.current?.focus()
  }

  const canSend = (input.trim() || pendingFile) && !sending
  const toolsActive = agent.tools?.webSearch || agent.tools?.secEdgar

  return (
    <div
      className="flex flex-col h-full"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      ref={dropZoneRef}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/10 shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>

        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors.bg} border ${colors.border}`}>
          <span className={`text-xs font-bold ${colors.text}`}>AI</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-tight">{agent.name}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-[11px] text-gray-600">
              {agent.model?.split('/').pop()} · {agent.provider}
            </p>
            <ToolBadge icon={Globe}      label="Web Search" active={agent.tools?.webSearch} />
            <ToolBadge icon={Building2}  label="SEC EDGAR"  active={agent.tools?.secEdgar} />
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={handleClearChat}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-white/10 hover:border-white/20 transition-all"
          >
            <RotateCcw size={11} />
            Clear
          </button>
        )}
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-5 py-6">

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 pb-16">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${colors.bg} border ${colors.border}`}>
              <span className={`text-2xl font-bold ${colors.text}`}>AI</span>
            </div>
            <div>
              <p className="text-base font-semibold text-white mb-1">{agent.name}</p>
              <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
                {agent.description || 'Ask anything or drop in a file to get started.'}
              </p>
            </div>
            {/* Active tools */}
            {toolsActive && (
              <div className="flex items-center gap-2 text-[11px] text-gray-600">
                <span className="text-gray-700">Tools:</span>
                {agent.tools?.webSearch && <span className="flex items-center gap-1"><Globe size={10} /> Web Search</span>}
                {agent.tools?.secEdgar  && <span className="flex items-center gap-1"><Building2 size={10} /> SEC EDGAR</span>}
              </div>
            )}
            {/* Suggested prompts */}
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {[
                'Summarize the key takeaways',
                'What are the biggest risks?',
                'What are the growth catalysts?',
                'Give me the top 5 metrics',
              ].map(prompt => (
                <button
                  key={prompt}
                  onClick={() => setInput(prompt)}
                  className="text-xs px-3 py-1.5 rounded-full border border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20 transition-all bg-white/[0.02]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} agentColors={colors} />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ── */}
      <div className="shrink-0 px-5 py-4 border-t border-white/10">

        {/* Status text */}
        {statusText && (
          <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
            <Loader2 size={11} className="animate-spin" />
            {statusText}
          </div>
        )}

        {/* Pending file chip */}
        {pendingFile && (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-accent-blue/10 border border-accent-blue/20 text-xs text-accent-blue w-fit">
            {isAudioFile(pendingFile) ? <Mic size={12} /> : <FileText size={12} />}
            <span className="font-medium max-w-[200px] truncate">{pendingFile.name}</span>
            <span className="opacity-60">{formatBytes(pendingFile.size)}</span>
            <button onClick={() => setPendingFile(null)} className="ml-1 hover:text-white transition-colors">
              <X size={12} />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* File attach */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={sending}
            className="p-2.5 rounded-xl border border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20 hover:bg-white/[0.04] transition-all disabled:opacity-40 shrink-0 mb-0.5"
            title="Attach file (PDF or audio)"
          >
            <Paperclip size={15} />
          </button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.mp3,.m4a,.wav,.ogg,.mp4"
            onChange={e => { const f = e.target.files?.[0]; if (f) setPendingFile(f); e.target.value = '' }}
          />

          {/* Text input */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            rows={1}
            placeholder={pendingFile ? 'Add a message or send file directly…' : 'Message the agent… (Shift+Enter for new line)'}
            className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 transition-colors resize-none leading-relaxed disabled:opacity-50"
            style={{ minHeight: '44px', maxHeight: '160px' }}
            onInput={e => {
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
            }}
          />

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={`p-2.5 rounded-xl border transition-all shrink-0 mb-0.5 ${
              canSend
                ? 'bg-accent-blue/20 border-accent-blue/30 text-accent-blue hover:bg-accent-blue/30'
                : 'border-white/10 text-gray-700 cursor-not-allowed'
            }`}
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>

        <p className="text-[10px] text-gray-700 mt-2 text-center">
          Drop files anywhere to attach · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
