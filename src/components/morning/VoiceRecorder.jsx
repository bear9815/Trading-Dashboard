import { useState, useRef } from 'react'
import { Mic, MicOff, Loader2, CheckCircle, XCircle, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { useSettingsStore } from '../../store/useSettingsStore.js'

// ── Gemini extraction ──────────────────────────────────────────────────────────

async function extractFieldsWithGemini(transcript, apiKey) {
  const prompt = `You are analyzing a trader's pre-market voice journal entry. Extract structured data from this transcript.

Return ONLY a valid JSON object with these exact fields (use null if a field is not mentioned or cannot be confidently inferred):
{
  "fomo": <integer 0-100: estimate their FOMO/chasing urge from their language. Calm = 0-30, moderate = 30-60, high FOMO = 60-100. null if unclear>,
  "fearGreed": <number -5 to +5 in 0.5 steps: negative = fearful/cautious, 0 = neutral, positive = greedy/aggressive. null if unclear>,
  "nasdaqNetHL": <integer: NASDAQ Net New Highs minus Lows they mention, e.g. -34 or +74. null if not mentioned>,
  "ndxMcsi": <exactly one of: "Bearish", "Neutral/Bearish", "Neutral", "Neutral/Bullish", "Bullish". null if not mentioned>,
  "marketBias": <exactly one of: "Bearish", "Neutral", "Bullish". null if not clear from context>,
  "confidence": <integer 1-5: 1=very low, 3=moderate, 5=very high confidence in their plan. null if unclear>,
  "mentalState": <exactly one of: "Anxious", "Cautious", "Calm", "Confident", "Focused". null if unclear>,
  "riskMode": <exactly one of: "cautious" (hard times, 0.25%), "normal" (0.5%), "good" (0.75%), "great" (1%). null if not mentioned>,
  "focusList": <string: comma-separated uppercase tickers mentioned as watchlist, e.g. "AAPL, NVDA, MSFT". null if none>,
  "gameplan": <string: concise summary of their trading plan for the day. null if no plan mentioned>,
  "lessons": <string: any lessons, rules, or process notes they mention. null if none>
}

Transcript: "${transcript.replace(/"/g, '\\"')}"

Return ONLY the JSON object. No explanation, no markdown, no code fences.`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
        },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    // Try fallback model if lite isn't available
    if (res.status === 404 || res.status === 400) {
      return extractFieldsWithGeminiFallback(transcript, apiKey, prompt)
    }
    throw new Error(err.error?.message || `Gemini API error ${res.status}`)
  }

  const data = await res.json()
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  // Strip any accidental markdown fences
  const jsonStr = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in Gemini response')
  return JSON.parse(jsonMatch[0])
}

async function extractFieldsWithGeminiFallback(transcript, apiKey, prompt) {
  // Fallback to gemini-2.5-flash if lite model not available
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Gemini API error ${res.status}`)
  }
  const data = await res.json()
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const jsonStr = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in Gemini response')
  return JSON.parse(jsonMatch[0])
}

// ── VoiceRecorder component ────────────────────────────────────────────────────

export default function VoiceRecorder({ onFieldsExtracted }) {
  const { apiKey } = useSettingsStore()
  const [status, setStatus]               = useState('idle') // idle | recording | processing | done | error
  const [transcript, setTranscript]       = useState('')
  const [errorMsg, setErrorMsg]           = useState('')
  const [showTranscript, setShowTranscript] = useState(false)
  const [extractedFields, setExtractedFields] = useState(null)

  const recognitionRef = useRef(null)
  const partsRef       = useRef([])

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setErrorMsg('Speech recognition not supported. Use Chrome or Edge.')
      setStatus('error')
      return
    }
    if (!apiKey) {
      setErrorMsg('Add your Gemini API key in Settings first.')
      setStatus('error')
      return
    }

    partsRef.current = []
    const rec = new SpeechRecognition()
    rec.continuous     = true
    rec.interimResults = false
    rec.lang           = 'en-US'

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        partsRef.current.push(e.results[i][0].transcript)
      }
    }

    rec.onend = async () => {
      const full = partsRef.current.join(' ').trim()
      setTranscript(full)
      if (!full) {
        setStatus('idle')
        return
      }
      setStatus('processing')
      try {
        const fields = await extractFieldsWithGemini(full, apiKey)
        // Only pass non-null fields so we don't overwrite already-set values
        const cleaned = Object.fromEntries(
          Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== '')
        )
        setExtractedFields(cleaned)
        onFieldsExtracted(cleaned)
        setStatus('done')
      } catch (err) {
        setStatus('error')
        setErrorMsg(err.message)
      }
    }

    rec.onerror = (e) => {
      if (e.error === 'aborted' || e.error === 'no-speech') return
      setStatus('error')
      setErrorMsg(`Mic error: ${e.error}`)
    }

    recognitionRef.current = rec
    rec.start()
    setStatus('recording')
  }

  const stopRecording = () => {
    recognitionRef.current?.stop()
    // onend fires automatically and handles the rest
  }

  const reset = () => {
    setStatus('idle')
    setTranscript('')
    setErrorMsg('')
    setShowTranscript(false)
    setExtractedFields(null)
  }

  // Summarise what Gemini extracted for the confirmation banner
  const extractionSummary = extractedFields ? (() => {
    const parts = []
    if (extractedFields.marketBias) parts.push(`Bias: ${extractedFields.marketBias}`)
    if (extractedFields.mentalState) parts.push(`Mind: ${extractedFields.mentalState}`)
    if (extractedFields.riskMode) parts.push(`Risk: ${extractedFields.riskMode}`)
    if (extractedFields.fomo != null) parts.push(`FOMO: ${extractedFields.fomo}`)
    if (extractedFields.confidence != null) parts.push(`Conf: ${extractedFields.confidence}/5`)
    if (extractedFields.focusList) parts.push(`Watch: ${extractedFields.focusList}`)
    const hasNotes = extractedFields.gameplan || extractedFields.lessons
    if (hasNotes) parts.push('+ notes filled')
    return parts
  })() : []

  return (
    <div className={`rounded-xl border p-4 transition-colors ${
      status === 'recording'
        ? 'border-accent-red/40 bg-accent-red/5'
        : status === 'done'
          ? 'border-accent-green/30 bg-accent-green/5'
          : status === 'error'
            ? 'border-accent-red/30 bg-accent-red/5'
            : 'border-white/10 bg-surface-100'
    }`}>

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sparkles size={13} className="text-accent-blue" />
          <span className="text-sm font-medium text-gray-300">Voice Journal</span>
          <span className="text-[10px] text-gray-600 bg-surface-300 border border-white/10 rounded px-1.5 py-0.5 mono">
            Gemini AI
          </span>
        </div>
        {(status === 'done' || status === 'error') && (
          <button
            type="button"
            onClick={reset}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Description */}
      {status === 'idle' && (
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          Speak your pre-market thoughts — Gemini will extract and pre-fill the form fields.
          Talk about the market, your mood, plan, watchlist, risk level…
        </p>
      )}

      {/* Main control button */}
      <div className="flex items-center gap-3 flex-wrap">
        {status === 'idle' && (
          <button
            type="button"
            onClick={startRecording}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-blue/10 border border-accent-blue/30 text-accent-blue hover:bg-accent-blue/20 transition-all text-sm font-medium"
          >
            <Mic size={15} />
            Start Recording
          </button>
        )}

        {status === 'recording' && (
          <>
            <button
              type="button"
              onClick={stopRecording}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-red/10 border border-accent-red/40 text-accent-red hover:bg-accent-red/20 transition-all text-sm font-medium"
            >
              <MicOff size={15} />
              Stop &amp; Analyze
            </button>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-accent-red animate-pulse" />
              <span className="text-xs text-gray-400">Listening… speak naturally, then press Stop</span>
            </div>
          </>
        )}

        {status === 'processing' && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 size={15} className="animate-spin text-accent-blue" />
            <span>Analyzing with Gemini…</span>
          </div>
        )}

        {status === 'done' && (
          <div className="flex items-center gap-2 text-accent-green text-sm font-medium">
            <CheckCircle size={15} />
            Fields pre-filled — review &amp; adjust below
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center gap-2 text-accent-red text-sm">
            <XCircle size={15} />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Extraction summary chips */}
      {status === 'done' && extractionSummary.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {extractionSummary.map((s, i) => (
            <span
              key={i}
              className="text-[11px] bg-accent-green/10 border border-accent-green/20 text-accent-green rounded-full px-2 py-0.5 mono"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Transcript toggle */}
      {transcript && status !== 'idle' && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowTranscript(v => !v)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {showTranscript ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showTranscript ? 'Hide transcript' : 'Show transcript'}
          </button>
          {showTranscript && (
            <p className="mt-2 text-xs text-gray-400 bg-surface-200 border border-white/10 rounded-lg p-3 leading-relaxed italic">
              "{transcript}"
            </p>
          )}
        </div>
      )}

      {/* Tip when no API key */}
      {status === 'error' && errorMsg.includes('Gemini API key') && (
        <p className="mt-2 text-xs text-gray-500">
          → Go to <strong className="text-gray-300">Settings</strong> → Gemini API Key and paste your key from{' '}
          <span className="text-accent-blue">aistudio.google.com</span>
        </p>
      )}
    </div>
  )
}
