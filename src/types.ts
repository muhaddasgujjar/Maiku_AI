export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface TranscriptSegment {
  id: string
  text: string
  timestamp: number
  isFinal: boolean
}

export interface Suggestion {
  id: string
  bullets: string[]
  context: string
  timestamp: number
}

export type WsMessage =
  | { type: 'transcript'; segment: TranscriptSegment }
  | { type: 'suggestion'; suggestion: Suggestion }
  | { type: 'status'; message: string }
  | { type: 'error'; message: string }
  | { type: 'listening_start' }
  | { type: 'listening_stop' }

// Exposed by preload.js via contextBridge
declare global {
  interface Window {
    maiku: {
      getBackendUrl: () => Promise<string>
      moveWindow: (deltaX: number, deltaY: number) => void
      toggleVisibility: () => void
    }
  }
}
