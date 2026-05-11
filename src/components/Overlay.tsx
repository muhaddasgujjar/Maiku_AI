import { useRef, useState } from 'react'
import StatusBar from './StatusBar'
import Transcript from './Transcript'
import Suggestions from './Suggestions'
import DocumentPanel from './DocumentPanel'
import SettingsPanel from './SettingsPanel'
import type {
  ConnectionStatus, TabName, TranscriptSegment, Suggestion, AppSettings, DocEntry,
} from '../types'

interface Props {
  status: ConnectionStatus
  transcript: TranscriptSegment[]
  suggestions: Suggestion[]
  isListening: boolean
  isGenerating: boolean
  answerError: string | null
  activeTab: TabName
  settings: AppSettings
  docs: DocEntry[]
  backendUrl: string
  onToggleListening: () => void
  onForceAnswer: () => void
  onClear: () => void
  onTabChange: (tab: TabName) => void
  onSaveSettings: (s: AppSettings) => Promise<void>
  onDocsChange: () => void
  onSaveSession: () => Promise<boolean>
}

const TABS: { id: TabName; label: string }[] = [
  { id: 'listen', label: 'Listen' },
  { id: 'docs', label: 'Docs' },
  { id: 'settings', label: 'Settings' },
]

type LayoutMode = 'normal' | 'compact' | 'answer-only'

export default function Overlay({
  status, transcript, suggestions, isListening, isGenerating, answerError,
  activeTab, settings, docs, backendUrl,
  onToggleListening, onForceAnswer, onClear, onTabChange,
  onSaveSettings, onDocsChange, onSaveSession,
}: Props) {
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [layout, setLayout] = useState<LayoutMode>('normal')

  const cycleLayout = () => {
    const next: LayoutMode =
      layout === 'normal' ? 'compact' : layout === 'compact' ? 'answer-only' : 'normal'
    setLayout(next)
    window.maiku?.resizeWindow(next)
  }

  const layoutLabel = layout === 'normal' ? 'Compact' : layout === 'compact' ? 'Answer only' : 'Full'

  const handleSave = async () => {
    const ok = await onSaveSession()
    setSaveMsg(ok ? 'Saved!' : 'Failed')
    setTimeout(() => setSaveMsg(null), 2000)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    dragStart.current = { x: e.screenX, y: e.screenY }

    const onMove = (ev: MouseEvent) => {
      if (!dragStart.current) return
      const dx = ev.screenX - dragStart.current.x
      const dy = ev.screenY - dragStart.current.y
      dragStart.current = { x: ev.screenX, y: ev.screenY }
      window.maiku?.moveWindow(dx, dy)
    }
    const onUp = () => {
      dragStart.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className={`overlay layout-${layout}`} onMouseDown={handleMouseDown}>
      <StatusBar
        status={status}
        isListening={isListening}
        layoutLabel={layoutLabel}
        onCycleLayout={cycleLayout}
        onClose={() => window.maiku?.toggleVisibility()}
      />

      {/* answer-only: no tabs, just the full-height answer */}
      {layout === 'answer-only' ? (
        <div className="answer-only-wrap" data-no-drag>
          <Suggestions
            suggestions={suggestions}
            isGenerating={isGenerating}
            answerError={answerError}
          />
          <div className="answer-only-bar">
            <button
              className="btn-gen"
              onClick={onForceAnswer}
              disabled={!isListening || status !== 'connected'}
              title="Force generate answer now"
              data-no-drag
            >
              ⟳ Generate
            </button>
            <button className="btn-clear-sm" onClick={onClear} data-no-drag title="Clear">Clear</button>
          </div>
        </div>
      ) : (
        <>
          <div className="tab-bar" data-no-drag>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="tab-content" data-no-drag>
            {activeTab === 'listen' && (
              <div className="listen-layout">
                {/* ── Answer — primary, dominant ── */}
                <div className="answer-section">
                  <Suggestions
                    suggestions={suggestions}
                    isGenerating={isGenerating}
                    answerError={answerError}
                  />
                </div>

                {/* ── Transcript — secondary, smaller ── */}
                {layout === 'normal' && (
                  <div className="transcript-section">
                    <div className="section-header">Transcript</div>
                    <Transcript segments={transcript} />
                  </div>
                )}

                {/* ── Controls ── */}
                <div className="control-bar">
                  <button
                    className={`btn-listen ${isListening ? 'active' : ''}`}
                    onClick={onToggleListening}
                    disabled={status !== 'connected'}
                    title={isListening ? 'Stop listening' : 'Start listening'}
                  >
                    {isListening ? '■ Stop' : '● Listen'}
                  </button>
                  <button
                    className="btn-gen"
                    onClick={onForceAnswer}
                    disabled={!isListening || status !== 'connected'}
                    title="Force generate answer now"
                  >
                    ⟳ Answer
                  </button>
                  <button
                    className="btn-save-session"
                    onClick={handleSave}
                    title="Save session"
                    disabled={transcript.length === 0 && suggestions.length === 0}
                  >
                    {saveMsg ?? 'Save'}
                  </button>
                  <button className="btn-clear" onClick={onClear} title="Clear session">
                    Clear
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'docs' && (
              <DocumentPanel
                docs={docs}
                backendUrl={backendUrl}
                onDocsChange={onDocsChange}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsPanel
                settings={settings}
                backendUrl={backendUrl}
                onSave={onSaveSettings}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
