import { useState } from 'react'

interface Props {
  onComplete: (groqApiKey: string) => void
}

const GROQ_KEY_RE = /^gsk_[A-Za-z0-9]{40,}$/

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)

  async function handleStart() {
    const trimmed = key.trim()
    if (!trimmed) { setError('Please paste your Groq API key.'); return }
    if (!GROQ_KEY_RE.test(trimmed)) {
      setError('That doesn\'t look like a Groq key (should start with gsk_).')
      return
    }
    setError('')
    setTesting(true)
    try {
      const res = await fetch('http://127.0.0.1:8765/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groq_api_key: trimmed, api_provider: 'groq' }),
      })
      if (!res.ok) throw new Error('Backend rejected the key')
      onComplete(trimmed)
    } catch {
      setError('Could not connect to backend. Make sure the app has finished loading.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logo}>🎯</div>
          <div>
            <div style={styles.logoTitle}>Maiku AI</div>
            <div style={styles.logoSub}>Interview Copilot</div>
          </div>
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div style={styles.body}>
            <h2 style={styles.title}>Welcome to Maiku AI</h2>
            <p style={styles.desc}>
              Maiku AI listens to your interview and generates real-time AI answers
              — completely invisible to screen sharing and recording.
            </p>

            <div style={styles.features}>
              {[
                ['🔒', 'Invisible overlay', 'Hidden from Zoom, Teams, Meet recording'],
                ['🎤', 'Listens live', 'Captures interviewer audio via WASAPI'],
                ['⚡', 'Instant answers', 'Groq AI responds in under 1 second'],
              ].map(([icon, title, desc]) => (
                <div key={title} style={styles.featureRow}>
                  <span style={styles.featureIcon}>{icon}</span>
                  <div>
                    <div style={styles.featureTitle}>{title}</div>
                    <div style={styles.featureDesc}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <button style={styles.btnPrimary} onClick={() => setStep(1)}>
              Get Started →
            </button>
          </div>
        )}

        {/* Step 1: Get API key */}
        {step === 1 && (
          <div style={styles.body}>
            <div style={styles.stepBadge}>Step 1 of 2</div>
            <h2 style={styles.title}>Get your free API key</h2>
            <p style={styles.desc}>
              Maiku AI uses <strong style={{ color: '#818cf8' }}>Groq</strong> for ultra-fast AI inference.
              Groq's free tier gives you 7,200 seconds of audio transcription per day — plenty for multiple interviews.
            </p>

            <div style={styles.steps}>
              <div style={styles.stepRow}>
                <div style={styles.stepNum}>1</div>
                <div>
                  Open <a style={styles.link} href="https://console.groq.com/keys" target="_blank" rel="noreferrer">console.groq.com/keys</a> in your browser
                </div>
              </div>
              <div style={styles.stepRow}>
                <div style={styles.stepNum}>2</div>
                <div>Sign up for a free account (no credit card)</div>
              </div>
              <div style={styles.stepRow}>
                <div style={styles.stepNum}>3</div>
                <div>Click <strong>"Create API Key"</strong> and copy it</div>
              </div>
              <div style={styles.stepRow}>
                <div style={styles.stepNum}>4</div>
                <div>Come back here and paste it on the next screen</div>
              </div>
            </div>

            <div style={styles.row}>
              <button style={styles.btnGhost} onClick={() => setStep(0)}>← Back</button>
              <button style={styles.btnPrimary} onClick={() => setStep(2)}>I have my key →</button>
            </div>
          </div>
        )}

        {/* Step 2: Enter key */}
        {step === 2 && (
          <div style={styles.body}>
            <div style={styles.stepBadge}>Step 2 of 2</div>
            <h2 style={styles.title}>Enter your Groq API key</h2>
            <p style={styles.desc}>
              Your key is stored locally on your PC — it is never sent to any Maiku server.
            </p>

            <label style={styles.label} htmlFor="apikey">Groq API Key</label>
            <input
              id="apikey"
              style={{ ...styles.input, ...(error ? styles.inputError : {}) }}
              type="password"
              placeholder="gsk_••••••••••••••••••••••••••••••••••••••••••••••••••••••••"
              value={key}
              onChange={(e) => { setKey(e.target.value); setError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleStart() }}
              autoFocus
            />
            {error && <div style={styles.errorMsg}>{error}</div>}

            <div style={styles.hint}>
              Key starts with <code style={styles.code}>gsk_</code> and is about 56 characters long.
              Get one free at <a style={styles.link} href="https://console.groq.com/keys" target="_blank" rel="noreferrer">console.groq.com</a>
            </div>

            <div style={styles.row}>
              <button style={styles.btnGhost} onClick={() => setStep(1)}>← Back</button>
              <button
                style={{ ...styles.btnPrimary, opacity: testing ? 0.6 : 1 }}
                onClick={handleStart}
                disabled={testing}
              >
                {testing ? 'Connecting...' : 'Start Using Maiku AI ✓'}
              </button>
            </div>

            <button
              style={styles.skipLink}
              onClick={() => onComplete('')}
            >
              Skip for now — I'll add it in Settings
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(5,5,10,0.97)',
    backdropFilter: 'blur(20px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '16px',
  },
  card: {
    width: '100%', maxWidth: '400px',
    background: 'rgba(20,22,35,0.98)',
    border: '1px solid rgba(99,102,241,0.25)',
    borderRadius: '18px',
    overflow: 'hidden',
    boxShadow: '0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.1)',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '20px 24px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(99,102,241,0.06)',
  },
  logo: {
    width: '40px', height: '40px', borderRadius: '10px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '20px', flexShrink: 0,
  },
  logoTitle: { fontWeight: 800, fontSize: '16px', color: '#e2e8f0' },
  logoSub: { fontSize: '11px', color: '#64748b', marginTop: '1px' },
  body: { padding: '24px' },
  title: {
    fontSize: '20px', fontWeight: 800, color: '#e2e8f0',
    marginBottom: '10px', letterSpacing: '-0.02em',
  },
  desc: { fontSize: '13px', color: '#94a3b8', lineHeight: 1.7, marginBottom: '20px' },
  features: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' },
  featureRow: { display: 'flex', alignItems: 'flex-start', gap: '12px' },
  featureIcon: {
    width: '32px', height: '32px', borderRadius: '8px',
    background: 'rgba(99,102,241,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '16px', flexShrink: 0,
  },
  featureTitle: { fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginBottom: '2px' },
  featureDesc: { fontSize: '12px', color: '#64748b' },
  stepBadge: {
    display: 'inline-block',
    padding: '3px 10px', borderRadius: '999px',
    background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)',
    fontSize: '11px', fontWeight: 700, color: '#818cf8',
    marginBottom: '12px', letterSpacing: '0.04em',
  },
  steps: { display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' },
  stepRow: { display: 'flex', alignItems: 'flex-start', gap: '12px', fontSize: '13px', color: '#94a3b8' },
  stepNum: {
    width: '22px', height: '22px', borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '11px', fontWeight: 800, color: '#fff', flexShrink: 0,
  },
  link: { color: '#818cf8', textDecoration: 'underline', cursor: 'pointer' },
  label: { display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.04em' },
  input: {
    width: '100%', padding: '10px 12px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', color: '#e2e8f0',
    fontSize: '13px', outline: 'none',
    fontFamily: 'inherit', marginBottom: '8px',
    transition: 'border-color .2s',
  },
  inputError: { borderColor: 'rgba(239,68,68,0.5)' },
  errorMsg: { fontSize: '12px', color: '#f87171', marginBottom: '8px' },
  hint: { fontSize: '12px', color: '#64748b', lineHeight: 1.6, marginBottom: '20px' },
  code: {
    background: 'rgba(255,255,255,0.08)', padding: '1px 5px',
    borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px',
  },
  row: { display: 'flex', gap: '8px', marginBottom: '12px' },
  btnPrimary: {
    flex: 1, padding: '10px 16px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    border: 'none', borderRadius: '9px',
    color: '#fff', fontSize: '13px', fontWeight: 700,
    cursor: 'pointer', letterSpacing: '0.01em',
  },
  btnGhost: {
    padding: '10px 16px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '9px',
    color: '#94a3b8', fontSize: '13px', fontWeight: 600,
    cursor: 'pointer',
  },
  skipLink: {
    display: 'block', width: '100%', background: 'none', border: 'none',
    color: '#475569', fontSize: '12px', cursor: 'pointer',
    textAlign: 'center', padding: '4px',
  },
}
