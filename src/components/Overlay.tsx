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
  onToggleListening, onClear, onTabChange, onSaveSettings, onDocsChange, onSaveSession,
}: Props) {
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [layout, setLayout] = useState<LayoutMode>('normal')

  const cycleLayout = () => {
    const next: LayoutMode = layout === 'normal' ? 'compact' : layout === 'compact' ? 'answer-only' : 'normal'
    setLayout(next)
    window.maiku?.resizeWindow(next)
  }

  const layoutIcon = layout === 'normal' ? '⊡' : layout === 'compact' ? '⊟' : '⊞'
  const layoutTitle = layout === 'normal' ? 'Compact mode' : layout === 'compact' ? 'Answer-only mode' : 'Full mode'

  const handleSave = async () => {
    const ok = await onSaveSession()
    setSaveMsg(ok ? 'Saved' : 'Failed')
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
        layoutIcon={layoutIcon}
        layoutTitle={layoutTitle}
        onCycleLayout={cycleLayout}
        onClose={() => window.maiku?.toggleVisibility()}
      />

      {/* Answer panel — always visible regardless of layout */}
      <div className="panel-section answer-section">
        <Suggestions
          suggestions={suggestions}
          isGenerating={isGenerating}
          answerError={answerError}
        />
      </div>

      {/* Tab bar + content — hidden in answer-only layout */}
      {layout !== 'answer-only' && (
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
              <>
                {layout === 'normal' && (
                  <div className="panel-section">
                    <Transcript segments={transcript} />
                  </div>
                )}
                <div className="control-bar">
                  <button
                    className={`btn-listen ${isListening ? 'active' : ''}`}
                    onClick={onToggleListening}
                    disabled={status !== 'connected'}
                    title={isListening ? 'Stop listening' : 'Start listening'}
                  >
                    {isListening ? 'Stop' : 'Listen'}
                  </button>
                  <button
                    className="btn-save-session"
                    onClick={handleSave}
                    title="Save session to file"
                    disabled={transcript.length === 0 && suggestions.length === 0}
                  >
                    {saveMsg ?? 'Save'}
                  </button>
                  <button className="btn-clear" onClick={onClear} title="Clear session">
                    Clear
                  </button>
                </div>
              </>
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
