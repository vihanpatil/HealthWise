# backend/app/logic/rag_instance.py
from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, Any, List, Optional
import threading

from app.logic import rag as rag_module

@dataclass
class RagInstance:
    store_path: str
    _lock: threading.Lock = threading.Lock()

    def ensure_ready(self) -> str:
        with self._lock:
            rag_module.ensure_store_exists(self.store_path)
            if not rag_module.is_ready():
                return rag_module.build_index(self.store_path)
            return "OK"

    def build(self) -> str:
        with self._lock:
            rag_module.ensure_store_exists(self.store_path)
            return rag_module.build_index(self.store_path)

    def retrieve(self, text: str, top_k: int = 6) -> List[Dict[str, Any]]:
        with self._lock:
            rag_module.ensure_store_exists(self.store_path)
            # build_index will run if dirty via maybe_rebuild()
            return rag_module.retrieve(text, top_k=top_k)

# simple registry so we reuse instances per store
_INSTANCES: Dict[str, RagInstance] = {}

def get_rag(store_path: str) -> RagInstance:
    inst = _INSTANCES.get(store_path)
    if inst is None:
        inst = RagInstance(store_path=store_path)
        _INSTANCES[store_path] = inst
    return inst
