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

async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 600): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options)
      return res
    } catch (err) {
      if (i === retries - 1) throw err
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw new Error('All retries failed')
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
    setMessage({ text: 'Connecting to backend…', ok: true })

    try {
      // Health check first so we get a clear error if backend is down
      await fetchWithRetry(`${backendUrl}/health`, { method: 'GET' }, 4, 800)

      setMessage({ text: 'Indexing…', ok: true })

      const res = await fetchWithRetry(
        `${backendUrl}/documents`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: `${docType}_${Date.now()}`,
            content: content.trim(),
            metadata: { label: DOC_TYPE_LABELS[docType], type: docType, doc_id: docType },
          }),
        },
        3,
        600,
      )

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Server error ${res.status}${body ? ': ' + body : ''}`)
      }

      setContent('')
      setMessage({ text: `${DOC_TYPE_LABELS[docType]} indexed successfully.`, ok: true })
      onDocsChange()
    } catch (e) {
      const raw = (e as Error).message ?? String(e)
      const isNetwork = raw.toLowerCase().includes('failed to fetch')
        || raw.toLowerCase().includes('network')
        || raw.toLowerCase().includes('econnrefused')
        || raw.toLowerCase().includes('err_connection_refused')

      setMessage({
        text: isNetwork
          ? 'Cannot reach backend. Make sure the app is fully started (status bar shows Ready), then try again.'
          : `Upload failed: ${raw}`,
        ok: false,
      })
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (docId: string) => {
    setDeletingId(docId)
    try {
      await fetchWithRetry(
        `${backendUrl}/documents/${encodeURIComponent(docId)}`,
        { method: 'DELETE' },
        3,
        400,
      )
      onDocsChange()
    } catch {
      // ignore
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

      {docs.length === 0 && !uploading && (
        <div className="doc-empty">
          No documents indexed yet.<br />
          Paste your CV above to get personalised answers.
        </div>
      )}
    </div>
  )
}
