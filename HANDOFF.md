# Maiku_AI — AI Handoff Document

> This document lets any AI assistant pick up exactly where the last session left off.
> **Always update the "Current State" section before ending a session.**

---

## What This App Does
Maiku_AI is an interview copilot desktop app. When a user is in a video interview (Zoom, Teams, Meet), this app:
1. Captures the interviewer's voice via WASAPI system audio loopback
2. Transcribes it in real time using Groq Whisper
3. Retrieves relevant context from user's CV / job description (ChromaDB RAG)
4. Generates concise talking points via Groq LLaMA
5. Displays suggestions in a floating overlay **that is invisible to screen sharing**

The stealth layer uses `setContentProtection(true)` in Electron, which on Windows calls `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`.

---

## Tech Stack
| Layer | Technology | Notes |
|-------|-----------|-------|
| Desktop shell | Electron v33 | Uses setContentProtection for screen privacy |
| Frontend | React 18 + TypeScript + Vite | Hot reload in dev |
| Backend | Python 3.14 + FastAPI | WebSocket on ws://localhost:8765 |
| STT | Groq Whisper large-v3 | Free: 7200 sec/day |
| LLM | Groq llama-3.3-70b-versatile | Free tier |
| Embeddings | sentence-transformers all-MiniLM-L6-v2 | Local, no cost |
| Vector DB | ChromaDB | Local persistent store in ./backend/chroma_db/ |
| Audio | PyAudioWPatch | WASAPI loopback capture |

---

## Project Structure
```
Maiku_AI/
├── PHASES.md              ← Development roadmap (check this first)
├── HANDOFF.md             ← This file
├── .env.example           ← Copy to .env and add GROQ_API_KEY
├── .gitignore
├── package.json           ← Electron + Vite + React dependencies
├── vite.config.ts         ← Vite config (renderer process)
├── tsconfig.json
├── index.html             ← Vite entry HTML
├── electron/
│   ├── main.js            ← Electron main process (window creation, IPC, setContentProtection)
│   └── preload.js         ← Context bridge (exposes safe IPC to renderer)
├── src/
│   ├── main.tsx           ← React entry point
│   ├── App.tsx            ← Root component, WebSocket manager
│   ├── types.ts           ← Shared TypeScript types
│   ├── components/
│   │   ├── Overlay.tsx    ← Main overlay wrapper
│   │   ├── Transcript.tsx ← Live transcript display
│   │   ├── Suggestions.tsx← AI talking point bullets
│   │   └── StatusBar.tsx  ← Backend connection status
│   └── styles/
│       └── index.css      ← Global styles (dark, minimal)
└── backend/
    ├── main.py            ← FastAPI app + WebSocket hub
    ├── groq_client.py     ← Groq API (Whisper + LLaMA)
    ├── audio_capture.py   ← WASAPI loopback (PyAudioWPatch)
    ├── rag.py             ← ChromaDB + sentence-transformers RAG
    ├── config.py          ← Settings loaded from .env
    └── requirements.txt
```

---

## Current State (Updated: 2026-05-10)
**Phases 1–4 (partial) complete — full pipeline implemented.**

All core features are coded and ready to test:
- WASAPI audio capture → Groq Whisper → live transcript
- RAG (ChromaDB + sentence-transformers) → Groq LLM → 3 bullet suggestions
- Overlay UI with 3 tabs: Listen | Docs | Settings
- Global hotkey Ctrl+Alt+M to toggle visibility
- Document upload (paste CV/JD text → indexed into RAG)
- Settings panel (API key + model persisted to userData, pushed to backend at runtime)

**First run steps:**
1. `npm install` — install Node deps (if not done)
2. `pip install -r backend/requirements.txt` — install Python deps
3. Copy `.env.example` → `.env`, add `GROQ_API_KEY=gsk_...`
4. `python backend/main.py` — start backend
5. `npm run dev` — start Electron (Vite + Electron in parallel)
6. Go to Settings tab → enter Groq API key → Save
7. Go to Docs tab → paste your CV → Index Document
8. Go to Listen tab → click Listen → play a video to test transcript

**Remaining Phase 4:**
- Session log (save Q&A to JSON)
- Opacity slider in Settings

---

## Key Architectural Decisions
1. **Electron over Tauri**: Rust not installed on dev machine. Electron's `setContentProtection` achieves the same screen-hiding effect via WDA_EXCLUDEFROMCAPTURE.
2. **WebSocket communication**: Backend runs as a separate Python process, Electron connects as WebSocket client on ws://localhost:8765
3. **Groq free tier**: During dev, use `llama3-8b-8192` (higher quota) over `llama-3.3-70b-versatile` to conserve free requests.
4. **Audio chunking**: 5-second PCM chunks sent to Groq Whisper (not streaming WebSocket to Groq — their REST API is simpler)
5. **RAG sliding window**: Keep last 10 minutes of transcript as LLM context, RAG pulls top-3 chunks from docs

---

## Environment Variables
```
GROQ_API_KEY=gsk_...          # Required — get free at console.groq.com
BACKEND_PORT=8765              # WebSocket server port
LLM_MODEL=llama3-8b-8192      # llama-3.3-70b-versatile for prod
STT_MODEL=whisper-large-v3     # Groq Whisper model
CHROMA_PERSIST_DIR=./chroma_db # ChromaDB storage path
```

---

## Known Issues / TODOs
- [ ] PyAudioWPatch install may fail on some Windows configs — fallback: use `sounddevice` with WASAPI
- [ ] Groq Whisper has ~500ms latency per chunk — acceptable for 5-sec chunks
- [ ] ChromaDB requires `sqlite3` — Python 3.14 should have it built-in
- [ ] `setContentProtection` on Linux is unreliable — document this limitation
