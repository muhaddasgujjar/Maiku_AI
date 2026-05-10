"""
RAG pipeline — ChromaDB + sentence-transformers for local document retrieval.
No API cost: embeddings run locally on CPU via all-MiniLM-L6-v2.
"""
import logging
import textwrap
from pathlib import Path
from typing import Optional

from config import CHROMA_PERSIST_DIR

log = logging.getLogger('maiku.rag')

COLLECTION_NAME = 'maiku_docs'
CHUNK_SIZE = 400
CHUNK_OVERLAP = 80


class RAGPipeline:
    def __init__(self):
        self._collection = None
        self._embedding_fn = None

    def initialize(self) -> None:
        try:
            import chromadb  # type: ignore
            from chromadb.utils import embedding_functions  # type: ignore

            Path(CHROMA_PERSIST_DIR).mkdir(parents=True, exist_ok=True)

            self._embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
                model_name='all-MiniLM-L6-v2'
            )

            client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
            self._collection = client.get_or_create_collection(
                name=COLLECTION_NAME,
                embedding_function=self._embedding_fn,
            )
            log.info('RAG pipeline initialized. Docs in store: %d', self._collection.count())
        except ImportError as e:
            log.warning('RAG dependencies missing (%s) — RAG disabled. Install: pip install chromadb sentence-transformers', e)
        except Exception as e:
            log.error('RAG init failed: %s', e)

    def add_document(self, doc_id: str, content: str, metadata: Optional[dict] = None) -> None:
        if self._collection is None:
            log.warning('RAG not initialized — skipping document ingestion')
            return

        chunks = self._chunk_text(content)
        ids = [f'{doc_id}_{i}' for i in range(len(chunks))]
        metas = [{**(metadata or {}), 'doc_id': doc_id, 'chunk': i} for i in range(len(chunks))]

        self._collection.upsert(documents=chunks, ids=ids, metadatas=metas)
        log.info('Ingested doc "%s" → %d chunks', doc_id, len(chunks))

    def query(self, query_text: str, n_results: int = 3) -> list[str]:
        if self._collection is None or not query_text.strip():
            return []

        try:
            results = self._collection.query(
                query_texts=[query_text],
                n_results=min(n_results, self._collection.count() or 1),
            )
            docs = results.get('documents', [[]])[0]
            return [d for d in docs if d]
        except Exception as e:
            log.error('RAG query failed: %s', e)
            return []

    @staticmethod
    def _chunk_text(text: str) -> list[str]:
        """Split text into overlapping chunks for better retrieval."""
        words = text.split()
        chunks = []
        i = 0
        while i < len(words):
            chunk_words = words[i: i + CHUNK_SIZE]
            chunks.append(' '.join(chunk_words))
            i += CHUNK_SIZE - CHUNK_OVERLAP
        return [c for c in chunks if c.strip()]
