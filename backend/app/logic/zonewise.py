# backend/app/logic/zonewise_chat.py
from pathlib import Path
from typing import Any, Dict, List

from app.config import ZONEWISE_DATA
from app.logic.rag_instance import get_rag
from app.logic.rootwise import call_nvidia_chat  # reuse same NVIDIA chat helper
from app.logic.rootwise import _safe_has_good_hits, _format_evidence  # reuse helpers

rag_zone = get_rag(str(ZONEWISE_DATA))

def initialize_zonewise_rag() -> str:
    ZONEWISE_DATA.mkdir(parents=True, exist_ok=True)
    return rag_zone.build()

def stream_zonewise_response(message: str, history):
    if history is None:
        history = []

    # ensure ZONEWISE index
    init_msg = rag_zone.ensure_ready()
    # If still not ready, respond gracefully
    # (rag_module sets readiness based on internal state)
    try:
        hits = rag_zone.retrieve(message, top_k=6)
    except Exception as e:
        yield history + [(message, f"ZoneWise RAG not ready. {init_msg}. Error: {e}")]
        return

    k = len(hits)

    # agentic retry if weak
    if not _safe_has_good_hits(hits):
        reformulated = call_nvidia_chat([
            {"role": "system", "content": "Rewrite the user's message into a short, keyword-heavy search query to retrieve relevant documentation."},
            {"role": "user", "content": message},
        ])
        hits = rag_zone.retrieve(reformulated, top_k=6)
        k = len(hits)

    if not _safe_has_good_hits(hits):
        assistant_text = (
            "I can’t find strong support for that in the ZoneWise documents currently loaded.\n\n"
            "If you add the relevant PDF/TXT to system_data/zonewise_data, I’ll answer using only that source."
        )
        yield history + [(message, assistant_text)]
        return

    evidence = _format_evidence(hits)

    truncated_history = ""
    if history:
        for user_msg, assistant_msg in history[-2:]:
            truncated_history += f"User: {str(user_msg)[:300]}\nAssistant: {str(assistant_msg)[:300]}\n"

    system_prompt = (
        "You are ZoneWise — a concise assistant for personal health analytics.\n\n"
        "NON-NEGOTIABLE GROUNDING RULES:\n"
        "- You must answer ONLY using the EVIDENCE provided.\n"
        "- Do NOT use general medical knowledge to add health claims.\n"
        "- If the evidence does not explicitly state a fact, say you cannot confirm it from the documents.\n"
        "- Each sentence that contains a factual claim MUST end with at least one citation.\n"
        f"- You may ONLY cite sources in the range [1] to [{k}].\n"
        "- Cite sources inline like ... [1][2]. Do NOT put citations on their own line.\n"
        "- Only cite a source if that specific chunk explicitly supports that specific claim.\n"
    )

    user_prompt = (
        f"RECENT CHAT (context only, not evidence):\n{truncated_history}\n\n"
        f"EVIDENCE (authoritative):\n{evidence}\n\n"
        f"USER QUESTION:\n{message}\n\n"
        "Answer using ONLY the evidence. Keep it short and practical."
    )

    assistant_text = call_nvidia_chat([
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ])

    yield history + [(message, str(assistant_text))]
