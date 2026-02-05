# backend/app/logic/zonewise_chat.py
from typing import Any, Dict, List
from pathlib import Path

from app.config import ZONEWISE_DATA
from app.logic.rag_instance import get_rag
from app.logic.rootwise import call_nvidia_chat

rag_zone = get_rag(str(ZONEWISE_DATA))


def initialize_zonewise_rag() -> str:
    ZONEWISE_DATA.mkdir(parents=True, exist_ok=True)
    return rag_zone.build()


# TODO: uncomment this once we have better data
# def _safe_has_good_hits(hits: List[Dict[str, Any]]) -> bool:
#     good = [h for h in hits if h.get("text") and len(h["text"].strip()) > 80]
#     return len(good) >= 2


def _format_evidence(hits: List[Dict[str, Any]], max_chars_per_chunk: int = 900) -> str:
    blocks = []
    for i, h in enumerate(hits):
        txt = (h.get("text") or "").strip()
        if not txt:
            continue
        if len(txt) > max_chars_per_chunk:
            txt = txt[:max_chars_per_chunk].rstrip() + "…"

        src = h.get("file") or "unknown"
        page = h.get("page")
        page_str = str(page) if page is not None else "?"
        blocks.append(f"[{i+1}] (source: {src}, page: {page_str})\n{txt}")
    return "\n\n".join(blocks)


def stream_zonewise_response(message: str, history):
    if history is None:
        history = []

    try:
        init_msg = rag_zone.ensure_ready()
    except Exception as e:
        yield history + [(message, f"ZoneWise RAG not ready. Error: {str(e)}")]
        return

    try:
        hits = rag_zone.retrieve(message, top_k=6)
    except Exception as e:
        yield history + [
            (message, f"ZoneWise RAG query failed. {init_msg}. Error: {str(e)}")
        ]
        return

    k = len(hits)

    # TODO: uncomment these once we have better data, for now not having this shows the chatbot at least trying to answer prompts

    # agentic retry if weak
    # if not _safe_has_good_hits(hits):
    #     reformulated = call_nvidia_chat([
    #         {"role": "system", "content": "Rewrite the user's message into a short, keyword-heavy search query to retrieve relevant documentation."},
    #         {"role": "user", "content": message},
    #     ])
    #     hits = rag_zone.retrieve(reformulated, top_k=6)
    #     k = len(hits)

    # # refuse to invent
    # if not _safe_has_good_hits(hits):
    #     assistant_text = (
    #         "I can’t find strong support for that in the ZoneWise documents currently loaded.\n\n"
    #         "If you add the relevant PDF/TXT to system_data/zonewise_data, I’ll answer using only that source."
    #     )
    #     yield history + [(message, assistant_text)]
    #     return

    evidence = _format_evidence(hits)

    truncated_history = ""
    if history:
        for user_msg, assistant_msg in history[-2:]:
            truncated_history += (
                f"User: {str(user_msg)[:300]}\nAssistant: {str(assistant_msg)[:300]}\n"
            )

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
        f"RECENT CHAT (context only, not evidence):\n{truncated_history or '(none)'}\n\n"
        f"EVIDENCE (authoritative):\n{evidence}\n\n"
        f"USER QUESTION:\n{message}\n\n"
        "Answer using ONLY the evidence. Keep it short and practical."
    )

    assistant_text = call_nvidia_chat(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
    )

    yield history + [(message, str(assistant_text))]
