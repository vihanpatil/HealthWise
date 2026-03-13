# backend/app/logic/rag_service.py
import os
from pathlib import Path
import threading
from typing import Any, Optional

from dotenv import load_dotenv
import faiss
from llama_index.core import SimpleDirectoryReader, VectorStoreIndex
from llama_index.core.node_parser import SentenceSplitter
from llama_index.embeddings.nvidia import NVIDIAEmbedding
from llama_index.readers.file import PDFReader
from llama_index.vector_stores.faiss import FaissVectorStore
from openai import OpenAI

BASE_DIR = Path(__file__).resolve().parents[3]
load_dotenv(BASE_DIR / ".env")


SUPPORTED_EXTS = (".txt", ".pdf")


class RagService:
    def __init__(self, store_path: str):
        self.store_path = store_path
        self._lock = threading.Lock()
        self._dirty = False

        self._embed_model: Optional[NVIDIAEmbedding] = None
        self._embed_dim: Optional[int] = None

        self._index: Optional[VectorStoreIndex] = None
        self._query_engine = None

        self._openai_client = None

    # --- embeddings ---
    def _get_embed_model(self) -> NVIDIAEmbedding:
        if self._embed_model is None:
            self._embed_model = NVIDIAEmbedding(
                model="nvidia/nv-embedqa-e5-v5",                
                api_key=os.getenv("NGC_API_KEY")
            )
        return self._embed_model

    def _get_embed_dim(self) -> int:
        if self._embed_dim is None:
            v = self._get_embed_model().get_text_embedding("dimension check")
            self._embed_dim = len(v)
        return self._embed_dim

    # --- store/files ---
    def ensure_store_exists(self) -> str:
        os.makedirs(self.store_path, exist_ok=True)
        return self.store_path

    def list_rag_files(self) -> list[str]:
        self.ensure_store_exists()
        return [
            f
            for f in os.listdir(self.store_path)
            if f.endswith(SUPPORTED_EXTS)
            and os.path.isfile(os.path.join(self.store_path, f))
        ]

    # --- indexing ---
    def mark_dirty(self):
        self._dirty = True

    def _load_all_documents(self) -> list:
        self.ensure_store_exists()
        reader = SimpleDirectoryReader(
            input_dir=self.store_path,
            recursive=False,
            file_extractor={".pdf": PDFReader()},
            required_exts=[".txt", ".pdf"],
        )
        return reader.load_data()

    def build_index(self) -> str:
        with self._lock:
            docs = self._load_all_documents()
            if not docs:
                self._index = None
                self._query_engine = None
                return (
                    f"Error: No valid .txt/.pdf documents found in {self.store_path}."
                )

            dim = self._get_embed_dim()
            vector_store = FaissVectorStore(faiss_index=faiss.IndexFlatL2(dim))
            splitter = SentenceSplitter(chunk_size=400, chunk_overlap=50)

            self._index = VectorStoreIndex.from_documents(
                docs,
                transformations=[splitter],
                vector_store=vector_store,
                embed_model=self._get_embed_model(),
            )
            self._query_engine = self._index.as_query_engine()
            self._dirty = False
            return "OK: RAG index built."

    def is_ready(self) -> bool:
        return self._query_engine is not None

    def ensure_ready(self) -> str:
        with self._lock:
            if self._query_engine is None or self._dirty:
                return self.build_index()
            return "OK"

    # --- retrieval ---
    def retrieve(self, text: str, top_k: int = 5) -> list[dict[str, Any]]:
        with self._lock:
            if self._index is None or self._dirty:
                self.build_index()
            if self._index is None:
                raise RuntimeError("RAG not initialized (no index).")

            retriever = self._index.as_retriever(similarity_top_k=top_k)
            results = retriever.retrieve(text)

            out = []
            for r in results:
                node = r.node
                meta = node.metadata or {}
                out.append(
                    {
                        "score": getattr(r, "score", None),
                        "text": node.get_text(),
                        "file": meta.get("file_name")
                        or meta.get("filename")
                        or meta.get("source")
                        or meta.get("file_path"),
                        "page": meta.get("page_label")
                        or meta.get("page")
                        or meta.get("page_number"),
                    }
                )
            return out

    # --- OpenAPI for external use ---
    def _get_openai_client(self) -> OpenAI:
        if self._openai_client is None:
            self._openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        return self._openai_client

    def call_chat(self, messages: list[dict[str, str]], model: str = None) -> str:
        """
        messages: [{"role": "system"|"user"|"assistant", "content": "..."}]
        """
        client = self._get_openai_client()
        use_model = model or os.getenv("OPENAI_CHAT_MODEL", "gpt-5.2")

        resp = client.chat.completions.create(
            model=use_model,
            messages=messages,
            temperature=0.2,
        )
        return resp.choices[0].message.content or ""
