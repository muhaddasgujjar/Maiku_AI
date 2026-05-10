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

# Sliding transcript buffer (last 10 minutes worth, roughly 1500 tokens)
transcript_buffer: list[str] = []
MAX_BUFFER_SEGMENTS = 60  # ~10 min at 10-sec intervals

# Stored event loop reference for thread-safe audio callbacks
_event_loop: asyncio.AbstractEventLoop | None = None


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
    """Transcribe one audio chunk and optionally generate suggestions."""
    try:
        text = await groq.transcribe(chunk)
        if not text.strip():
            return

        transcript_buffer.append(text)
        if len(transcript_buffer) > MAX_BUFFER_SEGMENTS:
            transcript_buffer.pop(0)

        await broadcast({
            'type': 'transcript',
            'segment': {
                'id': segment_id,
                'text': text,
                'timestamp': asyncio.get_running_loop().time(),
                'isFinal': True,
            },
        })

        # Generate suggestions every 3 transcript segments
        if len(transcript_buffer) % 3 == 0:
            await generate_suggestions()

    except Exception as e:
        log.error('process_audio_chunk error: %s', e)
        await broadcast({'type': 'error', 'message': str(e)})


async def generate_suggestions() -> None:
    """Run RAG + LLM to produce talking point bullets."""
    try:
        context_text = ' '.join(transcript_buffer[-10:])
        rag_chunks = rag.query(context_text, n_results=3)
        bullets = await groq.generate_suggestions(context_text, rag_chunks)

        if bullets:
            await broadcast({
                'type': 'suggestion',
                'suggestion': {
                    'id': str(uuid.uuid4()),
                    'bullets': bullets,
                    'context': context_text[-200:],
                    'timestamp': asyncio.get_running_loop().time(),
                },
            })
    except Exception as e:
        log.error('generate_suggestions error: %s', e)


# ── Lifespan ──────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(_: FastAPI):
    global _event_loop
    _event_loop = asyncio.get_running_loop()
    log.info('Maiku AI backend starting on %s:%d', BACKEND_HOST, BACKEND_PORT)
    rag.initialize()
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
                transcript_buffer.clear()
                log.info('Session cleared')

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


# ── Document ingestion endpoint ───────────────────────────────
@app.post('/documents')
async def ingest_document(payload: dict):
    """Ingest text content into the RAG vector store."""
    content = payload.get('content', '')
    doc_id = payload.get('id', str(uuid.uuid4()))
    metadata = payload.get('metadata', {})

    if not content:
        return {'error': 'No content provided'}

    rag.add_document(doc_id, content, metadata)
    return {'status': 'ok', 'doc_id': doc_id}


@app.get('/health')
async def health():
    return {'status': 'ok', 'groq_configured': bool(groq.api_key)}


# ── Entry point ───────────────────────────────────────────────
if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host=BACKEND_HOST, port=BACKEND_PORT, log_level='info')
