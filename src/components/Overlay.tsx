import { useRef } from 'react'
import StatusBar from './StatusBar'
import Transcript from './Transcript'
import Suggestions from './Suggestions'
import type { ConnectionStatus, TranscriptSegment, Suggestion } from '../types'

interface Props {
  status: ConnectionStatus
  transcript: TranscriptSegment[]
  suggestions: Suggestion[]
  isListening: boolean
  onToggleListening: () => void
  onClear: () => void
}

export default function Overlay({
  status, transcript, suggestions, isListening, onToggleListening, onClear,
}: Props) {
  const dragStart = useRef<{ x: number; y: number } | null>(null)

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
    <div className="overlay" onMouseDown={handleMouseDown}>
      <StatusBar status={status} isListening={isListening} />

      <div className="panel-section" data-no-drag>
        <Suggestions suggestions={suggestions} />
      </div>

      <div className="panel-section" data-no-drag>
        <Transcript segments={transcript} />
      </div>

      <div className="control-bar" data-no-drag>
        <button
          className={`btn-listen ${isListening ? 'active' : ''}`}
          onClick={onToggleListening}
          disabled={status !== 'connected'}
          title={isListening ? 'Stop listening' : 'Start listening'}
        >
          {isListening ? '⏹ Stop' : '▶ Listen'}
        </button>
        <button className="btn-clear" onClick={onClear} title="Clear session">
          Clear
        </button>
      </div>
    </div>
  )
}
