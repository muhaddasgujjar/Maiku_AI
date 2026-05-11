# Maiku_AI — Development Phases

> **For AI continuity**: Read this file first. It tracks what is done, what is in progress, and what comes next. Update it as you complete work.

## Project Overview
Maiku_AI is a desktop interview copilot — an invisible overlay that listens to the interviewer's audio in real time, transcribes it, and generates AI-powered talking point suggestions. The window is hidden from screen sharing via OS-level APIs.

**Stack**: Electron + React (frontend) | Python FastAPI (backend) | Groq API (free tier) | ChromaDB (local RAG)

---

## Phase 1: Foundation ✅ COMPLETE
**Goal**: Booting Electron app with screen-privacy + Python backend communicating via WebSocket

### Tasks
- [x] Project file structure created
- [x] PHASES.md, HANDOFF.md, .env.example
- [x] package.json (Electron + Vite + React)
- [x] Electron main process with setContentProtection(true)
- [x] Preload script (contextBridge IPC)
- [x] React overlay UI
- [x] Python FastAPI + WebSocket server
- [x] Groq client module (Whisper + LLM)
- [x] Audio capture module (WASAPI loopback + sounddevice fallback)
- [x] RAG module (ChromaDB + sentence-transformers)
- [x] requirements.txt

### Key Files
- `electron/main.js` — Electron window with `setContentProtection(true)`
- `electron/preload.js` — IPC bridge
- `src/App.tsx` — React entry, WebSocket connection
- `backend/main.py` — FastAPI + WebSocket hub

---

## Phase 2: Audio & Real-Time STT ✅ COMPLETE
**Goal**: Capture system audio (WASAPI loopback) and stream to Groq Whisper, show live transcript

### Tasks
- [x] `backend/audio_capture.py` — WASAPI loopback (PyAudioWPatch) + sounddevice fallback
- [x] `backend/groq_client.py` — Whisper transcription (5-sec WAV chunks → Groq REST)
- [x] Broadcast transcript via WebSocket to frontend
- [x] `src/components/Transcript.tsx` — render streaming text with auto-scroll
- [ ] **TODO**: Test end-to-end — play YouTube, verify transcript appears

### Key Decisions
- Audio chunk size: 5-second windows sent to Groq Whisper (streaming)
- Model: `whisper-large-v3` (Groq free tier: 7200 sec/day)
- Sample rate: 16000 Hz, mono, PCM16

---

## Phase 3: AI Brain (RAG + LLM) ✅ COMPLETE
**Goal**: Index user documents, retrieve relevant context, generate talking points via Groq LLM

### Tasks
- [x] ChromaDB PersistentClient in `backend/rag.py`
- [x] Document chunking (400 words, 80 overlap) + sentence-transformers embeddings
- [x] Sliding transcript buffer (last 60 segments ≈ 10 min)
- [x] Groq LLM generates 3 bullet talking points from RAG context
- [x] `src/components/Suggestions.tsx` — render AI bullets with context hint
- [x] `POST /documents` — ingest text → chunk → embed → store
- [x] `GET /documents` — list indexed docs with chunk counts
- [x] `DELETE /documents/{id}` — remove doc from vector store

### Default Documents to Index
- User CV (PDF/TXT upload)
- Job Description (paste or upload)
- Projects reference doc

---

## Phase 4: Polish & UX ✅ IN PROGRESS
**Goal**: Document upload UI, settings panel, session history, hotkeys

### Tasks
- [x] Settings panel: Groq API key input + model selector, persisted to userData/settings.json
- [x] `POST /settings` — apply API key + model at runtime without restart
- [x] Document manager: paste CV/JD/Notes → indexed into RAG; list + delete indexed docs
- [x] Global hotkey: Ctrl+Alt+M = toggle overlay visibility
- [x] Tab navigation: Listen | Docs | Settings
- [x] Drag-to-move frameless window
- [x] Session log: save transcript + suggestions to local JSON (`%APPDATA%\Maiku AI\sessions\`)
- [x] Opacity control (slider in settings, live preview via Electron setOpacity, persisted)

---

## Phase 5: Production ✅ IN PROGRESS
**Goal**: Packaged installer, auto-update, cross-platform, paid API upgrade path

### Tasks
- [x] `electron-builder` NSIS config (one-click off, desktop/start-menu shortcuts, custom dir)
- [x] `electron-updater` in dependencies; GitHub publish config in package.json
- [x] `backend/maiku_backend.spec` — PyInstaller one-dir spec
- [x] `build.ps1` — full build script (PyInstaller → copy → Vite → electron-builder)
- [x] Production backend: launches `resources/backend/maiku_backend/maiku_backend.exe`
- [x] Health-poll startup (60s timeout, error dialog on failure)
- [x] userData paths: CHROMA_PERSIST_DIR + HF_HOME → `%APPDATA%\Maiku AI\`
- [x] Auto-injects saved API key into backend env at launch
- [x] First-run auto-redirect to Settings tab
- [x] `npm install` — Electron binary installed, all deps present
- [ ] Create `assets/icon.ico` (256×256 ICO) for installer icon
- [ ] Push to GitHub → enable auto-update via electron-updater releases
- [ ] macOS / Linux testing
- [ ] Upgrade path: swap Groq free → paid when budget available

### To build the installer
```powershell
# 1. Fix Electron binary (one-time — see HANDOFF.md)
npm install

# 2. Run full build
.\build.ps1
# Output: dist-electron\Maiku AI Setup 0.1.0.exe
```

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
