# Maiku_AI — Development Phases

> **For AI continuity**: Read this file first. It tracks what is done, what is in progress, and what comes next. Update it as you complete work.

## Project Overview
Maiku_AI is a desktop interview copilot — an invisible overlay that listens to the interviewer's audio in real time, transcribes it, and generates AI-powered talking point suggestions. The window is hidden from screen sharing via OS-level APIs.

**Stack**: Electron + React (frontend) | Python FastAPI (backend) | Groq API (free tier) | ChromaDB (local RAG)

---

## Phase 1: Foundation ✅ IN PROGRESS
**Goal**: Booting Electron app with screen-privacy + Python backend communicating via WebSocket

### Tasks
- [x] Project file structure created
- [x] PHASES.md, HANDOFF.md, .env.example
- [x] package.json (Electron + Vite + React)
- [x] Electron main process with setContentProtection(true)
- [x] Preload script (contextBridge IPC)
- [x] React overlay UI (skeleton)
- [x] Python FastAPI + WebSocket server
- [x] Groq client module (Whisper + LLM stubs)
- [x] Audio capture module (WASAPI loopback stub)
- [x] RAG module (ChromaDB stub)
- [x] requirements.txt
- [ ] **NEXT**: Run `npm install` then `pip install -r backend/requirements.txt`
- [ ] **NEXT**: Start backend: `python backend/main.py`
- [ ] **NEXT**: Start frontend: `npm run dev`
- [ ] **NEXT**: Verify screen-share invisibility manually

### Key Files
- `electron/main.js` — Electron window with `setContentProtection(true)`
- `electron/preload.js` — IPC bridge
- `src/App.tsx` — React entry, WebSocket connection
- `backend/main.py` — FastAPI + WebSocket hub

---

## Phase 2: Audio & Real-Time STT ⏳ PENDING
**Goal**: Capture system audio (WASAPI loopback) and stream to Groq Whisper, show live transcript

### Tasks
- [ ] Install PyAudioWPatch: `pip install PyAudioWPatch`
- [ ] Implement `backend/audio_capture.py` — WASAPI loopback stream
- [ ] Implement `backend/groq_client.py` — Whisper streaming transcription
- [ ] Pipe audio chunks (16kHz mono PCM) to Groq `/audio/transcriptions`
- [ ] Broadcast transcript tokens via WebSocket to frontend
- [ ] `src/components/Transcript.tsx` — render streaming text
- [ ] Test: start a YouTube video, verify transcript appears in overlay

### Key Decisions
- Audio chunk size: 5-second windows sent to Groq Whisper (streaming)
- Model: `whisper-large-v3` (Groq free tier: 7200 sec/day)
- Sample rate: 16000 Hz, mono, PCM16

---

## Phase 3: AI Brain (RAG + LLM) ⏳ PENDING
**Goal**: Index user documents, retrieve relevant context, generate talking points via Groq LLM

### Tasks
- [ ] ChromaDB collection setup in `backend/rag.py`
- [ ] Document chunking & embedding (sentence-transformers `all-MiniLM-L6-v2`)
- [ ] Sliding context window: last 10 min of transcript tokens
- [ ] Groq LLM call: `llama-3.3-70b-versatile` with RAG context
- [ ] System prompt engineering: bullet-point talking points, max 3
- [ ] Frontend: `src/components/Suggestions.tsx` — render AI bullets
- [ ] Document upload endpoint: POST `/documents` → chunk → embed → store

### Default Documents to Index
- User CV (PDF/TXT upload)
- Job Description (paste or upload)
- Projects reference doc

---

## Phase 4: Polish & UX ⏳ PENDING
**Goal**: Document upload UI, settings panel, session history, hotkeys

### Tasks
- [ ] Settings window: API key input, model selection, opacity control
- [ ] Document manager: upload CV / JD, list indexed docs
- [ ] Hotkeys: Ctrl+Alt+M = toggle overlay visibility
- [ ] Session log: save Q&A pairs to local JSON
- [ ] Overlay resize / reposition (drag-to-move)
- [ ] Dark/light theme

---

## Phase 5: Production ⏳ PENDING
**Goal**: Packaged installer, auto-update, cross-platform, paid API upgrade path

### Tasks
- [ ] `electron-builder` config for Windows NSIS installer
- [ ] Auto-update via electron-updater
- [ ] macOS: `setContentProtection` already works (maps to NSWindow)
- [ ] Linux: `setContentProtection` — limited support, may need compositor
- [ ] Upgrade path: swap Groq free → paid when budget available
- [ ] Add `gpt-4o-mini` as optional LLM backend

---

## Environment Setup (Quick Start for New AI)
```bash
# 1. Install Node deps
npm install

# 2. Install Python deps
pip install -r backend/requirements.txt

# 3. Copy env and add Groq key
cp .env.example .env
# Edit .env: GROQ_API_KEY=gsk_...

# 4. Start backend
python backend/main.py

# 5. Start Electron dev
npm run dev
```

## Groq Free Tier Limits (as of 2026)
- Whisper large-v3: 7,200 audio seconds/day (~2 hrs)
- llama-3.3-70b-versatile: 1,000 requests/day, 14,400 req/day for llama3-8b
- Prefer `llama3-8b-8192` during dev to conserve free quota
