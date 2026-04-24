import { useCallback, useEffect, useRef, useState } from 'react'
import { synthesizeOpenRouterSpeech } from '../utils/openrouterVoice.js'

export function useOpenRouterVoice({ apiKey, voice, model } = {}) {
  const audioRef = useRef(null)
  const objectUrlRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle | loading | playing | error
  const [error, setError] = useState('')

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setStatus('idle')
  }, [])

  const playText = useCallback(async ({ text, instructions = '', speed = 1 } = {}) => {
    if (!text?.trim()) return
    stop()
    setStatus('loading')
    setError('')
    try {
      const blob = await synthesizeOpenRouterSpeech(apiKey, {
        input: text,
        instructions,
        speed,
        voice,
        model,
      })
      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        stop()
      }
      audio.onerror = () => {
        setStatus('error')
        setError('Voice playback failed.')
      }
      await audio.play()
      setStatus('playing')
    } catch (err) {
      setStatus('error')
      setError(err.message || 'Voice playback failed.')
    }
  }, [apiKey, model, stop, voice])

  useEffect(() => stop, [stop])

  return {
    status,
    error,
    isLoading: status === 'loading',
    isPlaying: status === 'playing',
    playText,
    stop,
  }
}
