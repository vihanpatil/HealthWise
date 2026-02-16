# backend/app/logic/rag.py
import os
import threading
from typing import Optional, List, Dict, Any

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
_rag_store = None
_lock = threading.Lock()
_dirty = False
_embed_dim = None


def mark_dirty():
    global _dirty
    _dirty = True


def maybe_rebuild():
    global _dirty
    with _lock:
        if _dirty:
            if not _rag_store:
                raise RuntimeError("RAG store path not set; cannot rebuild.")
            build_index(_rag_store)
            _dirty = False


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
    global _embed_dim
    if _embed_dim is None:
        v = get_embed_model().get_text_embedding("dimension check")
        _embed_dim = len(v)
    return _embed_dim


def ensure_store_exists(store_path: Optional[str] = None) -> str:
    global _rag_store
    if store_path:
        _rag_store = store_path

    if not _rag_store:
        raise RuntimeError(
            "RAG store path not set. Pass store_path to ensure_store_exists/build_index."
        )

    os.makedirs(_rag_store, exist_ok=True)
    return _rag_store


def list_rag_files() -> List[str]:
    ensure_store_exists()
    return [
        f
        for f in os.listdir(_rag_store)
        if f.endswith(SUPPORTED_EXTS) and os.path.isfile(os.path.join(_rag_store, f))
    ]


# ---------- Indexing ----------
def _load_all_documents() -> list:
    """
    Loads all supported files from rootwise_data into llama_index documents.
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
                input_files=[full_path], file_extractor={".pdf": PDFReader()}
            )
            documents.extend(reader.load_data())
        except Exception as e:
            print(f"[RAG] Skipping {fname}: {e}")
    return documents


def build_index(store_path: str) -> str:
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
            return f"Error: No valid .txt/.pdf documents found in {store_path}."

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
    maybe_rebuild()
    if not _query_engine:
        raise RuntimeError("RAG not initialized. Call build_index() first.")
    result = _query_engine.query(text)
    return str(result)


# ---------- Updating / Adding ----------
def add_text_file(filename: str, content: str) -> str:
    ensure_store_exists()
    if not filename.endswith(".txt"):
        filename += ".txt"
    path = os.path.join(_rag_store, filename)
    with open(path, "w") as f:
        f.write(content)

    mark_dirty()
    return "OK: updated (index refresh pending)."


def append_text_file(filename: str, line: str) -> str:
    ensure_store_exists()
    if not filename.endswith(".txt"):
        filename += ".txt"
    path = os.path.join(_rag_store, filename)
    with open(path, "a") as f:
        f.write(line.rstrip() + "\n")

    mark_dirty()
    return "OK: appended (index refresh pending)."


def retrieve(text: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """
    Return top_k retrieved chunks with metadata for grounding/citations.
    """
    maybe_rebuild()
    if not _index:
        raise RuntimeError("RAG not initialized. Call build_index() first.")

    retriever = _index.as_retriever(similarity_top_k=top_k)
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
                "page": meta.get("page_label") or meta.get("page") or meta.get("page_number"),
            }
        )
    return out


def has_good_hits(hits: List[dict], min_hits: int = 2) -> bool:
    # simple heuristic: at least N chunks with non-trivial text
    good = [h for h in hits if h.get("text") and len(h["text"].strip()) > 80]
    return len(good) >= min_hits
