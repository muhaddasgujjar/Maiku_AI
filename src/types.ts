export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export type TabName = 'listen' | 'chat' | 'docs' | 'settings'

export interface TranscriptSegment {
  id: string
  text: string
  timestamp: number
  isFinal: boolean
}

export interface Suggestion {
  id: string
  answer: string
  question: string
  timestamp: number
}

export type ApiProvider = 'groq' | 'openai' | 'anthropic' | 'openrouter'
export type PromptMode = 'interview' | 'coding' | 'sales' | 'support' | 'custom'
export type ResponseStyle = 'conversational' | 'bullet' | 'brief'
export type ResponseLength = 'short' | 'medium' | 'long'

export interface AppSettings {
  // API provider
  apiProvider?: ApiProvider
  groqApiKey?: string
  openaiApiKey?: string
  anthropicApiKey?: string
  openrouterApiKey?: string
  llmModel?: string

  // Prompt customization
  promptMode?: PromptMode
  persona?: string
  customSystemPrompt?: string
  responseStyle?: ResponseStyle
  responseLength?: ResponseLength

  // UI
  opacity?: number

  // Onboarding
  onboarded?: boolean
}

export interface ChatMessage {
  id: string
  question: string
  answer: string
  timestamp: number
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
  | { type: 'chat_generating' }
  | { type: 'chat_reply'; reply: ChatMessage }
  | { type: 'chat_error'; message: string }

export type WindowSize = 'compact' | 'normal' | 'answer-only'

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
