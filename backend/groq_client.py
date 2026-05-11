"""
Groq API client — Whisper STT and LLaMA LLM.
Free tier: whisper-large-v3 (7200 sec/day), llama-3.1-8b-instant (14400 req/day).
"""
import io
import logging
from typing import Optional

from groq import AsyncGroq

import config as _config
from config import GROQ_API_KEY, STT_MODEL

log = logging.getLogger('maiku.groq')

# Whisper prompt primes the model for tech interview vocabulary — improves accuracy
# for domain-specific terms that would otherwise be mis-transcribed.
WHISPER_PROMPT = (
    'Software engineering interview. Topics may include: Python, JavaScript, '
    'machine learning, system design, algorithms, APIs, cloud, React, SQL, '
    'data structures, microservices, CI/CD, Docker, Kubernetes.'
)

SYSTEM_PROMPT = """You are an expert interview coach helping in real time.
Given the interviewer's recent question/statement and relevant context from the candidate's CV and projects,
generate exactly 3 concise bullet-point talking points the candidate can use.

Rules:
- Each bullet starts with "• "
- Max 15 words per bullet
- Be specific, not generic
- Use concrete facts from the context when available
- Output ONLY the 3 bullets, nothing else"""


class GroqClient:
    def __init__(self):
        self.api_key = GROQ_API_KEY
        self._client: Optional[AsyncGroq] = None

    @property
    def client(self) -> AsyncGroq:
        if self._client is None:
            if not self.api_key:
                raise RuntimeError(
                    'GROQ_API_KEY not set. Add it to your .env file. '
                    'Get a free key at https://console.groq.com'
                )
            self._client = AsyncGroq(api_key=self.api_key)
        return self._client

    async def transcribe(self, audio_bytes: bytes) -> str:
        """Send WAV audio bytes to Groq Whisper and return transcript text."""
        try:
            audio_file = io.BytesIO(audio_bytes)
            audio_file.name = 'audio.wav'

            response = await self.client.audio.transcriptions.create(
                file=audio_file,
                model=STT_MODEL,
                response_format='text',
                language='en',
                prompt=WHISPER_PROMPT,
            )
            return str(response).strip()
        except Exception as e:
            log.error('Whisper transcription failed: %s', e)
            return ''

    async def generate_suggestions(
        self, transcript_context: str, rag_chunks: list[str]
    ) -> list[str]:
        """Generate 3 bullet-point talking points from transcript + RAG context."""
        rag_text = '\n'.join(rag_chunks) if rag_chunks else 'No additional context available.'

        user_message = (
            f"Interviewer's recent statement:\n{transcript_context}\n\n"
            f"Candidate's relevant background:\n{rag_text}"
        )

        try:
            response = await self.client.chat.completions.create(
                model=_config.LLM_MODEL,
                messages=[
                    {'role': 'system', 'content': SYSTEM_PROMPT},
                    {'role': 'user', 'content': user_message},
                ],
                max_tokens=300,
                temperature=0.4,
            )
            raw = response.choices[0].message.content or ''
            return _parse_bullets(raw)
        except Exception as e:
            log.error('LLM suggestion failed: %s', e)
            return []


def _parse_bullets(text: str) -> list[str]:
    """Extract bullet points from LLM output; tolerates •, -, * and numbered lists."""
    bullets = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        # Numbered: "1. ", "2. ", "3. "
        if len(line) >= 3 and line[0].isdigit() and line[1] == '.' and line[2] == ' ':
            bullets.append(line[3:].strip())
        # Symbol: "• ", "- ", "* "
        elif line[0] in ('•', '-', '*'):
            bullets.append(line[1:].strip())
        if len(bullets) == 3:
            break
    return bullets
