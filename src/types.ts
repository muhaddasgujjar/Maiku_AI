export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export type TabName = 'listen' | 'docs' | 'settings'

export interface TranscriptSegment {
  id: string
  text: string
  timestamp: number
  isFinal: boolean
}

export interface Suggestion {
  id: string
  answer: string       // full spoken answer — ready to read aloud
  question: string     // detected question from transcript
  timestamp: number
}

export interface AppSettings {
  groqApiKey?: string
  llmModel?: string
  opacity?: number
}

export interface SessionEntry {
  timestamp: number
  transcript: TranscriptSegment[]
  suggestions: Suggestion[]
}

export interface DocEntry {
  id: string
  label?: string
  chunks: number
}

export type WsMessage =
  | { type: 'transcript'; segment: TranscriptSegment }
  | { type: 'suggestion'; suggestion: Suggestion }
  | { type: 'generating' }
  | { type: 'status'; message: string }
  | { type: 'error'; message: string }
  | { type: 'listening_start' }
  | { type: 'listening_stop' }

export type WindowSize = 'compact' | 'normal' | 'answer-only'

// Exposed by preload.js via contextBridge
declare global {
  interface Window {
    maiku: {
      getBackendUrl: () => Promise<string>
      moveWindow: (deltaX: number, deltaY: number) => void
      toggleVisibility: () => void
      resizeWindow: (size: WindowSize) => void
      loadSettings: () => Promise<AppSettings>
      saveSettings: (data: AppSettings) => Promise<{ ok: boolean }>
      setOpacity: (val: number) => void
      saveSession: (data: SessionEntry) => Promise<{ ok: boolean; file: string }>
    }
  }
}
