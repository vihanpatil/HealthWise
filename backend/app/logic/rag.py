# backend/app/logic/rag.py
import os
import threading
from typing import Optional, List, Tuple

import faiss
from llama_index.core import SimpleDirectoryReader, VectorStoreIndex
from llama_index.vector_stores.faiss import FaissVectorStore
from llama_index.core.node_parser import SentenceSplitter
from llama_index.readers.file import PDFReader
from llama_index.embeddings.nvidia import NVIDIAEmbedding

# ---------- Globals (kept private to this module) ----------
_query_engine = None
_index = None
_embed_model = None
_rag_store = "./system_data"
_lock = threading.Lock()

SUPPORTED_EXTS = (".txt", ".pdf")


# ---------- Setup ----------
def get_embed_model() -> NVIDIAEmbedding:
    global _embed_model
    if _embed_model is None:
        _embed_model = NVIDIAEmbedding(
            model="nvidia/nv-embedqa-e5-v5",
            api_key=os.getenv("NGC_API_KEY"),
        )
    return _embed_model


def get_embed_dim() -> int:
    # Compute once reliably so FAISS dim is correct
    model = get_embed_model()
    v = model.get_text_embedding("dimension check")
    return len(v)


def ensure_store_exists(store_path: Optional[str] = None) -> str:
    global _rag_store
    if store_path:
        _rag_store = store_path
    os.makedirs(_rag_store, exist_ok=True)
    return _rag_store


def list_rag_files() -> List[str]:
    ensure_store_exists()
    return [
        f for f in os.listdir(_rag_store)
        if f.endswith(SUPPORTED_EXTS) and os.path.isfile(os.path.join(_rag_store, f))
    ]


# ---------- Indexing ----------
def _load_all_documents() -> list:
    """
    Loads all supported files from system_data into llama_index documents.
    Skips bad files without failing the whole init.
    """
    ensure_store_exists()
    documents = []
    for fname in os.listdir(_rag_store):
        if not fname.endswith(SUPPORTED_EXTS):
            continue
        full_path = os.path.join(_rag_store, fname)
        try:
            reader = SimpleDirectoryReader(
                input_files=[full_path],
                file_extractor={".pdf": PDFReader()}
            )
            documents.extend(reader.load_data())
        except Exception as e:
            print(f"[RAG] Skipping {fname}: {e}")
    return documents


def build_index(store_path: str = "./system_data") -> str:
    """
    Build (or rebuild) the in-memory index and query engine.
    Thread-safe.
    """
    global _query_engine, _index, _rag_store

    with _lock:
        ensure_store_exists(store_path)
        docs = _load_all_documents()
        if not docs:
            _query_engine = None
            _index = None
            return "Error: No valid .txt/.pdf documents found in system_data."

        dim = get_embed_dim()
        vector_store = FaissVectorStore(faiss_index=faiss.IndexFlatL2(dim))
        splitter = SentenceSplitter(chunk_size=400, chunk_overlap=50)

        _index = VectorStoreIndex.from_documents(
            docs,
            transformations=[splitter],
            vector_store=vector_store,
            embed_model=get_embed_model(),
        )
        _query_engine = _index.as_query_engine()
        return "OK: RAG index built."


def is_ready() -> bool:
    return _query_engine is not None


# ---------- Query ----------
def query(text: str) -> str:
    """
    Runs retrieval against the current query engine and returns text.
    """
    if not _query_engine:
        raise RuntimeError("RAG not initialized. Call build_index() first.")
    result = _query_engine.query(text)
    return str(result)


# ---------- Updating / Adding ----------
def add_text_file(filename: str, content: str) -> str:
    """
    Write/update a .txt file in system_data and rebuild index.
    """
    ensure_store_exists()
    if not filename.endswith(".txt"):
        filename += ".txt"

    path = os.path.join(_rag_store, filename)
    with open(path, "w") as f:
        f.write(content)

    return build_index(_rag_store)


def append_text_file(filename: str, line: str) -> str:
    """
    Append a line to a .txt file in system_data and rebuild index.
    """
    ensure_store_exists()
    if not filename.endswith(".txt"):
        filename += ".txt"

    path = os.path.join(_rag_store, filename)
    with open(path, "a") as f:
        f.write(line.rstrip() + "\n")

    return build_index(_rag_store)
