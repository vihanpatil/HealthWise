# backend/app/logic/zonewise_chat.py
from typing import Any, Dict, List, Optional

from app.config import ZONEWISE_DATA
from app.logic.rag_instance import get_rag
from app.logic.rootwise import call_nvidia_chat

rag_zone = get_rag(str(ZONEWISE_DATA))


def initialize_zonewise_rag() -> str:
    ZONEWISE_DATA.mkdir(parents=True, exist_ok=True)
    return rag_zone.build()


def _safe_has_good_hits(hits: List[Dict[str, Any]]) -> bool:
    good = [h for h in hits if h.get("text") and len(h["text"].strip()) > 80]
    return len(good) >= 2


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
        blocks.append(f"[{i + 1}] (source: {src}, page: {page_str})\n{txt}")
    return "\n\n".join(blocks)


def stream_zonewise_response(
    message: str,
    history,
    metric_context: Optional[str] = None,
):
    """
    metric_context:
      - Optional string describing the user's metrics (30/60/90/all-time).
      - This is NOT part of ZoneWise RAG evidence; it is user data context.
    """
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
        yield history + [(message, f"ZoneWise RAG query failed. {init_msg}. Error: {str(e)}")]
        return

    k = len(hits)

    if not _safe_has_good_hits(hits):
        reformulated = call_nvidia_chat(
            [
                {
                    "role": "system",
                    "content": "Rewrite the user's message into a short, keyword-heavy search query to retrieve relevant documentation.",
                },
                {"role": "user", "content": message},
            ]
        )
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
            truncated_history += (
                f"User: {str(user_msg)[:300]}\nAssistant: {str(assistant_msg)[:300]}\n"
            )

    metric_block = metric_context.strip() if isinstance(metric_context, str) else ""
    if not metric_block:
        metric_block = "(none)"

    system_prompt = (
        "You are ZoneWise — a concise assistant for personal health analytics.\n\n"
        "GROUNDING RULES:\n"
        "1) ZoneWise DOCUMENT claims MUST be grounded in EVIDENCE chunks and cited.\n"
        "   - If you make a claim about what ZoneWise docs say, you MUST cite like [1][2].\n"
        "   - You may ONLY cite sources in the range [1] to [{k}].\n"
        "   - Each doc-backed factual sentence should end with at least one citation.\n"
        "2) USER_METRIC_CONTEXT is user-specific data (not from documents).\n"
        "   - You MAY use it to personalize feedback and reference trends/baselines.\n"
        "   - DO NOT cite USER_METRIC_CONTEXT with [#] citations.\n"
        "   - If metric context is empty, say you don't have enough user data.\n"
        "3) Do NOT add general medical claims beyond what documents support.\n"
        "   - If a recommendation requires medical knowledge not present in evidence, say so.\n"
    ).format(k=k)

    user_prompt = (
        f"RECENT CHAT (context only):\n{truncated_history or '(none)'}\n\n"
        f"USER_METRIC_CONTEXT (user data, not evidence):\n{metric_block}\n\n"
        f"EVIDENCE (authoritative docs):\n{evidence}\n\n"
        f"USER QUESTION:\n{message}\n\n"
        "Answer:\n"
        "- Use EVIDENCE for doc claims (with citations).\n"
        "- Use USER_METRIC_CONTEXT only for personalization (no citations).\n"
        "- Keep it short and practical."
    )

    assistant_text = call_nvidia_chat(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
    )

    yield history + [(message, str(assistant_text))]
