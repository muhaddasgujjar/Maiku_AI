import { useEffect, useRef, useState, useCallback } from 'react'
import Overlay from './components/Overlay'
import type {
  ConnectionStatus, TabName, TranscriptSegment, Suggestion, WsMessage,
  AppSettings, DocEntry, SessionEntry,
} from './types'

const RECONNECT_DELAY_MS = 3000
const BACKEND_WS = 'ws://localhost:8765/ws'
const BACKEND_HTTP = 'http://localhost:8765'

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isListening, setIsListening] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [answerError, setAnswerError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabName>('listen')
  const [settings, setSettings] = useState<AppSettings>({})
  const [docs, setDocs] = useState<DocEntry[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load persisted settings on mount ──────────────────────────
  useEffect(() => {
    window.maiku?.loadSettings().then((saved) => {
      if (saved && Object.keys(saved).length > 0) {
        setSettings(saved)
        if (saved.opacity != null) window.maiku?.setOpacity(saved.opacity)
        if (saved.groqApiKey) {
          // Push saved key to backend (may already be running)
          fetch(`${BACKEND_HTTP}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              groq_api_key: saved.groqApiKey,
              llm_model: saved.llmModel,
            }),
          }).catch(() => { /* backend may not be up yet — it will read key from env */ })
        } else {
          // First run: no API key → guide user to Settings
          setActiveTab('settings')
        }
      } else {
        // No settings file at all → first run
        setActiveTab('settings')
      }
    }).catch(() => { /* not in Electron context (browser dev) */ })
  }, [])

  // ── WebSocket connection ───────────────────────────────────────
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')
    const ws = new WebSocket(BACKEND_WS)
    wsRef.current = ws

    ws.onopen = () => setStatus('connected')

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data)
        switch (msg.type) {
          case 'transcript':
            setTranscript((prev) => {
              const idx = prev.findIndex((s) => s.id === msg.segment.id)
              if (idx >= 0) {
                const updated = [...prev]
                updated[idx] = msg.segment
                return updated
              }
              return [...prev.slice(-20), msg.segment]
            })
            break
          case 'generating':
            setIsGenerating(true)
            setAnswerError(null)
            break
          case 'suggestion':
            setIsGenerating(false)
            setAnswerError(null)
            setSuggestions((prev) => [msg.suggestion, ...prev.slice(0, 4)])
            break
          case 'error':
            setIsGenerating(false)
            setAnswerError(msg.message)
            break
          case 'listening_start':
            setIsListening(true)
            break
          case 'listening_stop':
            setIsListening(false)
            break
        }
      } catch {
        // malformed message — ignore
      }
    }

    ws.onclose = () => {
      setStatus('disconnected')
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS)
    }

    ws.onerror = () => {
      setStatus('error')
      ws.close()
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      reconnectTimer.current && clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  // ── Commands ───────────────────────────────────────────────────
  const sendCommand = useCallback((cmd: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(cmd))
    }
  }, [])

  const toggleListening = useCallback(() => {
    sendCommand({ type: isListening ? 'stop_listening' : 'start_listening' })
  }, [isListening, sendCommand])

  const clearSession = useCallback(() => {
    setTranscript([])
    setSuggestions([])
    setAnswerError(null)
    setIsGenerating(false)
    sendCommand({ type: 'clear_session' })
  }, [sendCommand])

  // ── Document list ──────────────────────────────────────────────
  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_HTTP}/documents`)
      if (!res.ok) return
      const data = await res.json()
      setDocs(data.documents || [])
    } catch {
      // backend may not be ready
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'docs') fetchDocs()
  }, [activeTab, fetchDocs])

  // ── Settings save ──────────────────────────────────────────────
  const handleSaveSettings = useCallback(async (updated: AppSettings) => {
    setSettings(updated)
    await window.maiku?.saveSettings(updated)
  }, [])

  // ── Session save ───────────────────────────────────────────────
  const handleSaveSession = useCallback(async (): Promise<boolean> => {
    const entry: SessionEntry = {
      timestamp: Date.now(),
      transcript,
      suggestions,
    }
    try {
      await window.maiku?.saveSession(entry)
      return true
    } catch {
      return false
    }
  }, [transcript, suggestions])

  return (
    <Overlay
      status={status}
      transcript={transcript}
      suggestions={suggestions}
      isListening={isListening}
      isGenerating={isGenerating}
      answerError={answerError}
      activeTab={activeTab}
      settings={settings}
      docs={docs}
      backendUrl={BACKEND_HTTP}
      onToggleListening={toggleListening}
      onClear={clearSession}
      onTabChange={setActiveTab}
      onSaveSettings={handleSaveSettings}
      onDocsChange={fetchDocs}
      onSaveSession={handleSaveSession}
    />
  )
}
