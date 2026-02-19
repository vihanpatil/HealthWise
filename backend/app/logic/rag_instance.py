# backend/app/logic/rag_instance.py
from __future__ import annotations

from dataclasses import dataclass
import threading
from typing import Any, Dict, List

from app.logic.rag_service import RagService


@dataclass
class RagInstance:
    store_path: str
    _lock: threading.Lock = threading.Lock()
    _svc: RagService = None

    def __post_init__(self):
        self._svc = RagService(self.store_path)

    def ensure_ready(self) -> str:
        with self._lock:
            return self._svc.ensure_ready()

    def build(self) -> str:
        with self._lock:
            return self._svc.build_index()

    def retrieve(self, text: str, top_k: int = 6) -> List[Dict[str, Any]]:
        with self._lock:
            return self._svc.retrieve(text, top_k=top_k)

    def list_files(self) -> List[str]:
        with self._lock:
            return self._svc.list_rag_files()

    def call_chat(self, messages: List[Dict[str, str]], model: str = None) -> str:
        with self._lock:
            return self._svc.call_chat(messages, model=model)


# registry: one instance per store
_INSTANCES: Dict[str, RagInstance] = {}


def get_rag(store_path: str) -> RagInstance:
    inst = _INSTANCES.get(store_path)
    if inst is None:
        inst = RagInstance(store_path=store_path)
        _INSTANCES[store_path] = inst
    return inst
