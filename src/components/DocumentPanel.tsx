import { useState } from 'react'
import type { DocEntry } from '../types'

type DocType = 'cv' | 'jd' | 'custom'

const DOC_TYPE_LABELS: Record<DocType, string> = {
  cv: 'CV / Resume',
  jd: 'Job Description',
  custom: 'Other Notes',
}

interface Props {
  docs: DocEntry[]
  backendUrl: string
  onDocsChange: () => void
}

export default function DocumentPanel({ docs, backendUrl, onDocsChange }: Props) {
  const [docType, setDocType] = useState<DocType>('cv')
  const [content, setContent] = useState('')
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleUpload = async () => {
    if (!content.trim()) {
      setMessage({ text: 'Paste some text first.', ok: false })
      return
    }
    setUploading(true)
    setMessage(null)
    try {
      const res = await fetch(`${backendUrl}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: docType,
          content: content.trim(),
          metadata: { label: DOC_TYPE_LABELS[docType], type: docType },
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setContent('')
      setMessage({ text: `${DOC_TYPE_LABELS[docType]} indexed successfully.`, ok: true })
      onDocsChange()
    } catch (e) {
      const msg = (e as Error).message
      const hint = msg.toLowerCase().includes('fetch')
        ? 'Backend not ready — wait for the status bar to show Connected, then retry.'
        : msg
      setMessage({ text: `Upload failed: ${hint}`, ok: false })
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (docId: string) => {
    setDeletingId(docId)
    try {
      await fetch(`${backendUrl}/documents/${encodeURIComponent(docId)}`, { method: 'DELETE' })
      onDocsChange()
    } catch {
      // silently ignore
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="doc-panel">
      <div className="section-header">Documents</div>

      <div className="doc-type-select">
        {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((t) => (
          <button
            key={t}
            className={`doc-type-btn ${docType === t ? 'active' : ''}`}
            onClick={() => setDocType(t)}
            data-no-drag
          >
            {DOC_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <textarea
        className="doc-textarea"
        placeholder={`Paste your ${DOC_TYPE_LABELS[docType]} text here…`}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        data-no-drag
      />

      <button
        className="btn-upload"
        onClick={handleUpload}
        disabled={uploading || !content.trim()}
        data-no-drag
      >
        {uploading ? 'Indexing…' : 'Index Document'}
      </button>

      {message && (
        <div className={`doc-message ${message.ok ? 'ok' : 'err'}`}>{message.text}</div>
      )}

      {docs.length > 0 && (
        <div className="doc-list">
          <div className="doc-list-header">Indexed ({docs.length})</div>
          {docs.map((doc) => (
            <div key={doc.id} className="doc-item">
              <span className="doc-item-label">{doc.label || doc.id}</span>
              <span className="doc-item-chunks">{doc.chunks} chunks</span>
              <button
                className="doc-item-del"
                onClick={() => handleDelete(doc.id)}
                disabled={deletingId === doc.id}
                data-no-drag
                title="Remove from index"
              >
                {deletingId === doc.id ? '…' : '×'}
              </button>
            </div>
          ))}
        </div>
      )}

      {docs.length === 0 && (
        <div className="doc-empty">No documents indexed yet. Paste your CV to get personalised suggestions.</div>
      )}
    </div>
  )
}
