import { useEffect, useRef, useState, useCallback } from 'react'
import Overlay from './components/Overlay'
import type { ConnectionStatus, TranscriptSegment, Suggestion, WsMessage } from './types'

const RECONNECT_DELAY_MS = 3000
const BACKEND_WS_URL = 'ws://localhost:8765/ws'

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isListening, setIsListening] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')
    const ws = new WebSocket(BACKEND_WS_URL)
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
          case 'suggestion':
            setSuggestions((prev) => [msg.suggestion, ...prev.slice(0, 4)])
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
    sendCommand({ type: 'clear_session' })
  }, [sendCommand])

  return (
    <Overlay
      status={status}
      transcript={transcript}
      suggestions={suggestions}
      isListening={isListening}
      onToggleListening={toggleListening}
      onClear={clearSession}
    />
  )
}
