# PyInstaller spec for Maiku AI backend
# Build: cd backend && pyinstaller maiku_backend.spec --clean
# Output: backend/dist/maiku_backend/  (one-dir bundle)

from pathlib import Path
import chromadb

# Collect chromadb's migration SQL files (required at runtime)
chroma_path = Path(chromadb.__file__).parent
chroma_datas = [
    (str(chroma_path / 'migrations'), 'chromadb/migrations'),
]

a = Analysis(
    ['main.py'],
    pathex=[str(Path('.').resolve())],
    binaries=[],
    datas=chroma_datas,
    hiddenimports=[
        # FastAPI / Uvicorn
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.protocols.websockets.wsproto_impl',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'fastapi',
        'fastapi.middleware.cors',
        'starlette',
        'starlette.middleware',
        'starlette.middleware.cors',
        # ChromaDB
        'chromadb',
        'chromadb.utils.embedding_functions',
        'chromadb.utils.embedding_functions.sentence_transformer_embedding_function',
        'chromadb.db.migrations',
        'onnxruntime',
        'grpc',
        'opentelemetry',
        # Sentence Transformers
        'sentence_transformers',
        'torch',
        'transformers',
        'huggingface_hub',
        # Audio
        'pyaudiowpatch',
        'sounddevice',
        # Groq
        'groq',
        'httpx',
        # Misc
        'numpy',
        'scipy',
        'sklearn',
        'dotenv',
        'websockets',
        'anyio',
        'anyio.from_thread',
        'anyio._backends._asyncio',
        'multipart',
        'email_validator',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'IPython',
        'PIL',
        'cv2',
        'notebook',
        'jupyter',
        'test',
        'tests',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='maiku_backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,   # keep console for log visibility in production
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='maiku_backend',
)
