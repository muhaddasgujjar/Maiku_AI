import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / '.env')

GROQ_API_KEY: str = os.getenv('GROQ_API_KEY', '')
BACKEND_HOST: str = os.getenv('BACKEND_HOST', 'localhost')
BACKEND_PORT: int = int(os.getenv('BACKEND_PORT', '8765'))

STT_MODEL: str = os.getenv('STT_MODEL', 'whisper-large-v3')
LLM_MODEL: str = os.getenv('LLM_MODEL', 'llama3-8b-8192')

CHROMA_PERSIST_DIR: str = os.getenv(
    'CHROMA_PERSIST_DIR',
    str(Path(__file__).parent / 'chroma_db')
)

AUDIO_SAMPLE_RATE: int = int(os.getenv('AUDIO_SAMPLE_RATE', '16000'))
AUDIO_CHUNK_SECONDS: int = int(os.getenv('AUDIO_CHUNK_SECONDS', '5'))
AUDIO_DEVICE_NAME: str = os.getenv('AUDIO_DEVICE_NAME', '')
