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

# Primes Whisper for tech-interview vocabulary — reduces mis-transcription of domain terms
WHISPER_PROMPT = (
    'Software engineering interview. Topics may include: Python, JavaScript, '
    'machine learning, system design, algorithms, APIs, cloud, React, SQL, '
    'data structures, microservices, CI/CD, Docker, Kubernetes.'
)

SYSTEM_PROMPT = """You are a real-time interview assistant.
The user is in a live interview. You will receive what the interviewer just said and the candidate's background from their CV/documents.

Your job: write a complete, natural answer the candidate can read aloud RIGHT NOW.

Rules:
- Write in first person ("I", "my", "we")
- 150 to 250 words — thorough but readable in ~60 seconds
- Start by directly answering the question, then back it up with specific examples
- Use concrete facts from the candidate's background (numbers, project names, companies)
- If no CV context is available, write a strong general answer
- Sound confident and conversational, NOT like a list or essay
- Do NOT add headers, bullet points, or labels
- Output ONLY the answer text — nothing else, no preamble"""


class GroqClient:
    def __init__(self):
        self.api_key = GROQ_API_KEY
        self._client: Optional[AsyncGroq] = None

    @property
    def client(self) -> AsyncGroq:
        if self._client is None:
            if not self.api_key:
                raise RuntimeError(
                    'GROQ_API_KEY not set. Add it to .env or enter it in Settings. '
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

    async def generate_answer(
        self, recent_transcript: str, rag_chunks: list[str]
    ) -> tuple[str, str]:
        """
        Generate a full spoken answer from the recent transcript + CV context.
        Returns (answer_text, detected_question).
        """
        rag_text = '\n'.join(rag_chunks) if rag_chunks else 'No CV/document context available.'

        user_message = (
            f"What the interviewer just said:\n{recent_transcript}\n\n"
            f"Candidate's background (CV / documents):\n{rag_text}"
        )

        try:
            response = await self.client.chat.completions.create(
                model=_config.LLM_MODEL,
                messages=[
                    {'role': 'system', 'content': SYSTEM_PROMPT},
                    {'role': 'user', 'content': user_message},
                ],
                max_tokens=500,
                temperature=0.5,
            )
            answer = (response.choices[0].message.content or '').strip()

            # Extract the question for display in the UI
            question = _extract_question(recent_transcript)

            return answer, question
        except Exception as e:
            log.error('LLM answer failed: %s', e)
            return '', ''


def _extract_question(text: str) -> str:
    """Return the last sentence that looks like a question, or the last sentence."""
    sentences = [s.strip() for s in text.replace('\n', ' ').split('.') if s.strip()]
    # Prefer a sentence ending with ?
    for s in reversed(sentences):
        if '?' in s:
            return s.split('?')[0].strip() + '?'
    # Fall back to last sentence, truncated
    last = sentences[-1] if sentences else text
    return last[:120] + ('…' if len(last) > 120 else '')
