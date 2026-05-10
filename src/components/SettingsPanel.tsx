import { useState } from 'react'
import type { AppSettings } from '../types'

const MODELS = [
  { value: 'llama-3.1-8b-instant', label: 'llama-3.1-8b-instant (fast, dev)' },
  { value: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile (smarter)' },
]

interface Props {
  settings: AppSettings
  backendUrl: string
  onSave: (s: AppSettings) => Promise<void>
}

export default function SettingsPanel({ settings, backendUrl, onSave }: Props) {
  const [apiKey, setApiKey] = useState(settings.groqApiKey || '')
  const [model, setModel] = useState(settings.llmModel || 'llama-3.1-8b-instant')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      // Persist to Electron userData
      await onSave({ groqApiKey: apiKey, llmModel: model })

      // Push to running backend so it takes effect without restart
      if (apiKey) {
        await fetch(`${backendUrl}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groq_api_key: apiKey, llm_model: model }),
        })
      }

      setMessage({ text: 'Settings saved.', ok: true })
    } catch (e) {
      setMessage({ text: `Save failed: ${(e as Error).message}`, ok: false })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-panel">
      <div className="section-header">Settings</div>

      <div className="setting-row">
        <label className="setting-label">Groq API Key</label>
        <input
          className="setting-input"
          type="password"
          placeholder="gsk_…"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
          data-no-drag
        />
        <a
          className="setting-link"
          href="https://console.groq.com"
          target="_blank"
          rel="noreferrer"
          data-no-drag
        >
          Get free key ↗
        </a>
      </div>

      <div className="setting-row">
        <label className="setting-label">LLM Model</label>
        <select
          className="setting-select"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          data-no-drag
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <button
        className="btn-save"
        onClick={handleSave}
        disabled={saving}
        data-no-drag
      >
        {saving ? 'Saving…' : 'Save'}
      </button>

      {message && (
        <div className={`setting-message ${message.ok ? 'ok' : 'err'}`}>{message.text}</div>
      )}

      <div className="setting-note">
        Hotkey: <kbd>Ctrl+Alt+M</kbd> — toggle overlay visibility
      </div>
    </div>
  )
}
