"""
Maiku AI — FastAPI WebSocket backend
Orchestrates audio capture, STT, RAG, and LLM inference.
"""
import asyncio
import json
import logging
import uuid
from contextlib import asynccontextmanager
from typing import Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import BACKEND_HOST, BACKEND_PORT
from groq_client import GroqClient
from audio_capture import AudioCapture
from rag import RAGPipeline

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
)
log = logging.getLogger('maiku')

# ── Shared state ──────────────────────────────────────────────
clients: Set[WebSocket] = set()
groq = GroqClient()
audio = AudioCapture()
rag = RAGPipeline()

# Sliding transcript buffer (last 10 minutes worth)
transcript_buffer: list[str] = []
MAX_BUFFER_SEGMENTS = 60  # ~10 min at 5-sec chunks

# Time-based suggestion throttle
_last_suggestion_at: float = 0.0
QUESTION_INTERVAL_SEC = 2.0    # near-instant when a question is detected
IDLE_INTERVAL_SEC     = 12.0   # periodic refresh for non-question speech

# Question-word patterns that signal the interviewer is asking something
_QUESTION_WORDS = (
    'what', 'how', 'why', 'when', 'where', 'who', 'which',
    'tell me', 'describe', 'explain', 'walk me', 'give me',
    'can you', 'could you', 'would you', 'have you', 'do you',
    'are you', 'is there', 'show me', 'talk about', 'share',
)

# Stored event loop reference for thread-safe audio callbacks
_event_loop: asyncio.AbstractEventLoop | None = None


def _is_question(text: str) -> bool:
    """Return True if the transcribed text looks like an interviewer question."""
    lower = text.lower().strip()
    if '?' in lower:
        return True
    return any(lower.startswith(w) or f' {w} ' in lower for w in _QUESTION_WORDS)


# ── WebSocket hub ─────────────────────────────────────────────
async def broadcast(msg: dict) -> None:
    dead = set()
    for ws in clients:
        try:
            await ws.send_json(msg)
        except Exception:
            dead.add(ws)
    clients.difference_update(dead)


# ── Audio → STT → LLM pipeline ────────────────────────────────
async def process_audio_chunk(chunk: bytes, segment_id: str) -> None:
    """Transcribe one audio chunk and optionally generate an answer."""
    global _last_suggestion_at
    try:
        text = await groq.transcribe(chunk)
        if not text.strip():
            return

        transcript_buffer.append(text)
        if len(transcript_buffer) > MAX_BUFFER_SEGMENTS:
            transcript_buffer.pop(0)

        now = asyncio.get_running_loop().time()
        await broadcast({
            'type': 'transcript',
            'segment': {
                'id': segment_id,
                'text': text,
                'timestamp': now,
                'isFinal': True,
            },
        })

        is_question = _is_question(text)
        min_interval = QUESTION_INTERVAL_SEC if is_question else IDLE_INTERVAL_SEC
        if (now - _last_suggestion_at) >= min_interval:
            _last_suggestion_at = now
            log.info('Triggering answer (question=%s): %.60s', is_question, text)
            asyncio.ensure_future(generate_answer())

    except Exception as e:
        log.error('process_audio_chunk error: %s', e)
        await broadcast({'type': 'error', 'message': str(e)})


async def generate_answer() -> None:
    """Run RAG + LLM and broadcast the full spoken answer."""
    await broadcast({'type': 'generating'})
    try:
        if not groq.api_key:
            await broadcast({'type': 'error', 'message': 'Groq API key not set. Go to Settings and enter your key.'})
            return

        recent_text = ' '.join(transcript_buffer[-4:])
        rag_chunks = rag.query(recent_text, n_results=4)
        answer, question = await groq.generate_answer(recent_text, rag_chunks)

        if answer:
            await broadcast({
                'type': 'suggestion',
                'suggestion': {
                    'id': str(uuid.uuid4()),
                    'answer': answer,
                    'question': question,
                    'timestamp': asyncio.get_running_loop().time(),
                },
            })
            log.info('Answer generated (%d chars) for: %.60s', len(answer), question)
        else:
            await broadcast({'type': 'error', 'message': 'LLM returned empty. Check your Groq API key in Settings.'})
    except Exception as e:
        log.error('generate_answer error: %s', e)
        await broadcast({'type': 'error', 'message': f'Answer failed: {e}'})


# ── Lifespan ──────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(_: FastAPI):
    global _event_loop
    _event_loop = asyncio.get_running_loop()
    log.info('Maiku AI backend starting on %s:%d', BACKEND_HOST, BACKEND_PORT)
    rag.initialize()
    if rag._collection is None:
        log.warning('RAG pipeline NOT available — document context disabled')
    else:
        log.info('RAG pipeline ready')
    yield
    audio.stop()
    log.info('Maiku AI backend stopped')


# ── FastAPI app ───────────────────────────────────────────────
app = FastAPI(title='Maiku AI Backend', lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.websocket('/ws')
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    log.info('Client connected. Total: %d', len(clients))

    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            cmd = msg.get('type')

            if cmd == 'start_listening':
                if not audio.is_running:
                    await broadcast({'type': 'listening_start'})
                    audio.start(on_chunk=_audio_callback)
                    log.info('Audio capture started')

            elif cmd == 'stop_listening':
                audio.stop()
                await broadcast({'type': 'listening_stop'})
                log.info('Audio capture stopped')

            elif cmd == 'clear_session':
                global _last_suggestion_at
                transcript_buffer.clear()
                _last_suggestion_at = 0.0
                log.info('Session cleared')

            elif cmd == 'force_answer':
                # Manual trigger from UI button — ignores throttle
                if transcript_buffer:
                    _last_suggestion_at = asyncio.get_running_loop().time()
                    asyncio.ensure_future(generate_answer())
                    log.info('Force-answer triggered via UI')
                else:
                    await broadcast({'type': 'error', 'message': 'No transcript yet — start listening first.'})

    except WebSocketDisconnect:
        clients.discard(ws)
        log.info('Client disconnected. Total: %d', len(clients))
    except Exception as e:
        log.error('WebSocket error: %s', e)
        clients.discard(ws)


def _audio_callback(chunk: bytes) -> None:
    """Called from audio capture thread — schedule async processing."""
    if _event_loop is None or _event_loop.is_closed():
        return
    segment_id = str(uuid.uuid4())[:8]
    asyncio.run_coroutine_threadsafe(
        process_audio_chunk(chunk, segment_id),
        _event_loop,
    )


# ── Document endpoints ────────────────────────────────────────
@app.post('/documents')
async def ingest_document(payload: dict):
    if rag._collection is None:
        return JSONResponse(
            status_code=503,
            content={'error': 'RAG pipeline not ready. Install chromadb and sentence-transformers, then restart.'},
        )

    content = payload.get('content', '').strip()
    if not content:
        return JSONResponse(status_code=400, content={'error': 'No content provided'})

    doc_id = payload.get('id') or str(uuid.uuid4())
    metadata = payload.get('metadata', {})

    try:
        rag.add_document(doc_id, content, metadata)
        log.info('Document indexed: %s (%d chars)', doc_id, len(content))
        return {'status': 'ok', 'doc_id': doc_id}
    except Exception as e:
        log.error('ingest_document error: %s', e)
        return JSONResponse(status_code=500, content={'error': str(e)})


@app.get('/documents')
async def list_documents():
    if rag._collection is None:
        return {'documents': [], 'rag_ready': False}
    try:
        results = rag._collection.get(include=['metadatas'])
        chunk_counts: dict[str, dict] = {}
        for meta in (results.get('metadatas') or []):
            doc_id = meta.get('doc_id', '')
            if not doc_id:
                continue
            if doc_id not in chunk_counts:
                chunk_counts[doc_id] = {
                    'id': doc_id,
                    'label': meta.get('label', doc_id),
                    'chunks': 0,
                }
            chunk_counts[doc_id]['chunks'] += 1
        return {'documents': list(chunk_counts.values()), 'rag_ready': True}
    except Exception as e:
        log.error('list_documents error: %s', e)
        return {'documents': [], 'rag_ready': True}


@app.delete('/documents/{doc_id}')
async def delete_document(doc_id: str):
    if rag._collection is None:
        return JSONResponse(status_code=503, content={'error': 'RAG not initialized'})
    try:
        results = rag._collection.get(where={'doc_id': doc_id}, include=['metadatas'])
        ids = results.get('ids', [])
        if ids:
            rag._collection.delete(ids=ids)
        return {'status': 'ok', 'deleted': len(ids)}
    except Exception as e:
        log.error('delete_document error: %s', e)
        return JSONResponse(status_code=500, content={'error': str(e)})


# ── Runtime settings endpoint ─────────────────────────────────
@app.post('/settings')
async def update_settings(payload: dict):
    """Update API key and model at runtime without restarting."""
    api_key = payload.get('groq_api_key', '')
    llm_model = payload.get('llm_model', '')

    if api_key:
        groq.api_key = api_key
        groq._client = None  # force client re-init on next request

    if llm_model:
        import config as _cfg
        _cfg.LLM_MODEL = llm_model

    log.info('Settings updated via API (key=%s, model=%s)', bool(api_key), llm_model or 'unchanged')
    return {'status': 'ok'}


@app.get('/health')
async def health():
    return {
        'status': 'ok',
        'groq_configured': bool(groq.api_key),
        'rag_ready': rag._collection is not None,
    }


# ── Entry point ───────────────────────────────────────────────
if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host=BACKEND_HOST, port=BACKEND_PORT, log_level='info')
