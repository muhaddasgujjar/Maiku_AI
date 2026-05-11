import type { ConnectionStatus } from '../types'

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connecting: 'Connecting...',
  connected: 'Ready',
  disconnected: 'Reconnecting...',
  error: 'Error',
}

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connecting: '#f59e0b',
  connected: '#22c55e',
  disconnected: '#6b7280',
  error: '#ef4444',
}

interface Props {
  status: ConnectionStatus
  isListening: boolean
  onClose: () => void
}

export default function StatusBar({ status, isListening, onClose }: Props) {
  return (
    <div className="status-bar">
      <span className="app-title">Maiku AI</span>
      <div className="status-indicators">
        {isListening && (
          <span className="listening-badge">● REC</span>
        )}
        <span
          className="status-dot"
          style={{ color: STATUS_COLORS[status] }}
          title={STATUS_LABELS[status]}
        >
          ●
        </span>
        <span className="status-label">{STATUS_LABELS[status]}</span>
        <button
          className="btn-close"
          onClick={onClose}
          title="Hide overlay (Ctrl+Shift+M to show again)"
          data-no-drag
        >
          ✕
        </button>
      </div>
    </div>
  )
}
