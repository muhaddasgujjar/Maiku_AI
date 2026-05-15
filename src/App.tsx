import { useEffect, useRef, useState, useCallback } from 'react'
import Overlay from './components/Overlay'
import Onboarding from './components/Onboarding'
import type {
  ConnectionStatus, TabName, TranscriptSegment, Suggestion, WsMessage,
  AppSettings, DocEntry, SessionEntry, ChatMessage,
} from './types'

const RECONNECT_DELAY_MS = 3000
const BACKEND_WS = 'ws://127.0.0.1:8765/ws'
const BACKEND_HTTP = 'http://127.0.0.1:8765'

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isListening, setIsListening] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [answerError, setAnswerError] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isChatGenerating, setIsChatGenerating] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabName>('listen')
  const [settings, setSettings] = useState<AppSettings>({})
  const [docs, setDocs] = useState<DocEntry[]>([])
  const [showOnboarding, setShowOnboarding] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load persisted settings on mount ──────────────────────────
  useEffect(() => {
    window.maiku?.loadSettings().then((saved) => {
      if (saved && Object.keys(saved).length > 0) {
        setSettings(saved)
        if (saved.opacity != null) window.maiku?.setOpacity(saved.opacity)

        const hasAnyKey = saved.groqApiKey || saved.openaiApiKey || saved.anthropicApiKey || saved.openrouterApiKey
        if (hasAnyKey) {
          // Push all saved settings to running backend
          fetch(`${BACKEND_HTTP}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              groq_api_key: saved.groqApiKey ?? '',
              openai_api_key: saved.openaiApiKey ?? '',
              anthropic_api_key: saved.anthropicApiKey ?? '',
              openrouter_api_key: saved.openrouterApiKey ?? '',
              api_provider: saved.apiProvider ?? 'groq',
              llm_model: saved.llmModel ?? '',
              prompt_mode: saved.promptMode ?? 'interview',
              persona: saved.persona ?? '',
              custom_system_prompt: saved.customSystemPrompt ?? '',
              response_style: saved.responseStyle ?? 'conversational',
              response_length: saved.responseLength ?? 'medium',
            }),
          }).catch(() => { /* backend may not be up yet — key is injected at next launch via env */ })
        } else if (!saved.onboarded) {
          // First-ever launch with no API key — show the welcome wizard
          setShowOnboarding(true)
        } else {
          setActiveTab('settings')
        }
      } else {
        // Brand new install — show onboarding wizard
        setShowOnboarding(true)
      }
    }).catch(() => { /* not in Electron context (browser dev) */ })
  }, [])

  const handleOnboardingComplete = useCallback(async (groqApiKey: string) => {
    const updated: AppSettings = { ...settings, onboarded: true, ...(groqApiKey ? { groqApiKey, apiProvider: 'groq' } : {}) }
    setSettings(updated)
    await window.maiku?.saveSettings(updated)
    setShowOnboarding(false)
    if (!groqApiKey) setActiveTab('settings')
  }, [settings])

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
          case 'chat_generating':
            setIsChatGenerating(true)
            setChatError(null)
            break
          case 'chat_reply':
            setIsChatGenerating(false)
            setChatMessages((prev) => [...prev, msg.reply])
            break
          case 'chat_error':
            setIsChatGenerating(false)
            setChatError(msg.message)
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

  const forceAnswer = useCallback(() => {
    setAnswerError(null)
    sendCommand({ type: 'force_answer' })
  }, [sendCommand])

  const sendChatMessage = useCallback((text: string) => {
    setChatError(null)
    sendCommand({ type: 'chat_message', text })
  }, [sendCommand])

  const clearChat = useCallback(() => {
    setChatMessages([])
    setChatError(null)
  }, [])

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
    <>
      {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
      <Overlay
        status={status}
        transcript={transcript}
        suggestions={suggestions}
        isListening={isListening}
        isGenerating={isGenerating}
        answerError={answerError}
        chatMessages={chatMessages}
        isChatGenerating={isChatGenerating}
        chatError={chatError}
        activeTab={activeTab}
        settings={settings}
        docs={docs}
        backendUrl={BACKEND_HTTP}
        onToggleListening={toggleListening}
        onForceAnswer={forceAnswer}
        onClear={clearSession}
        onSendChat={sendChatMessage}
        onClearChat={clearChat}
        onTabChange={setActiveTab}
        onSaveSettings={handleSaveSettings}
        onDocsChange={fetchDocs}
        onSaveSession={handleSaveSession}
      />
    </>
  )
}
