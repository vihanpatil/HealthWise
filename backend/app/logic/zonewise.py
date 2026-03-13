# backend/app/logic/zonewise_chat.py
from typing import Any, Optional

from app.config import ZONEWISE_DATA
from app.logic.rag_instance import get_rag

rag_zone = get_rag(str(ZONEWISE_DATA))


def initialize_zonewise_rag() -> str:
    ZONEWISE_DATA.mkdir(parents=True, exist_ok=True)
    return rag_zone.build()


def _safe_has_good_hits(hits: list[dict[str, Any]]) -> bool:
    good = [h for h in hits if h.get("text") and len(h["text"].strip()) > 80]
    return len(good) >= 2


def _format_evidence(hits: list[dict[str, Any]], max_chars_per_chunk: int = 900) -> str:
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
        yield history + [
            (message, f"ZoneWise RAG query failed. {init_msg}. Error: {str(e)}")
        ]
        return

    k = len(hits)

    if not _safe_has_good_hits(hits):
        reformulated = rag_zone.call_chat(
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
        "You are ZoneWise — a concise, coach-like assistant for heart-rate zone training and personal health analytics.\n\n"

        "PRIMARY ROLE:\n"
        "- Combine DOCUMENT evidence with USER_METRIC_CONTEXT to provide structured training insights.\n"
        "- Ground all training science claims strictly in EVIDENCE.\n"
        "- Analyze user heart-rate zone data to identify trends and actionable recommendations.\n\n"

        "RESPONSE FORMAT (ALWAYS USE THIS STRUCTURE):\n"
        "Summary:\n"
        "- 1–3 sentences summarizing the key takeaway.\n\n"
        "User Data Insights:\n"
        "- Analyze USER_METRIC_CONTEXT.\n"
        "- You MAY compute trends, rolling averages, percentage changes, or polarization ratios.\n"
        "- Do NOT cite USER_METRIC_CONTEXT.\n\n"
        "Document-Grounded Insights:\n"
        "- Any claim about physiology, zone theory, adaptation, or training principles MUST be supported by EVIDENCE.\n"
        "- Cite using bracket format like [1] or [2][3].\n"
        f"- You may ONLY cite sources numbered [1] through [{k}].\n"
        "- Each document-grounded factual sentence must end with at least one citation.\n\n"
        "Recommendations:\n"
        "- Provide structured, actionable suggestions.\n"
        "- If recommendations rely on document-supported principles, cite appropriately.\n"
        "- Keep recommendations specific and measurable when possible.\n\n"
        "Confidence:\n"
        "- Briefly state whether conclusions are based primarily on strong document evidence, limited evidence, or mostly user trend analysis.\n\n"

        "GROUNDING RULES:\n"
        "1) Do NOT introduce general medical or physiological claims beyond what EVIDENCE supports.\n"
        "2) If EVIDENCE does not support a claim, explicitly say so.\n"
        "3) If USER_METRIC_CONTEXT is empty or insufficient, say you do not have enough user data.\n"
        "4) Do NOT cite USER_METRIC_CONTEXT.\n"
        "5) Do NOT invent citations.\n\n"

        "SAFETY BOUNDARIES:\n"
        "- Do NOT diagnose medical conditions.\n"
        "- Do NOT prescribe medication.\n"
        "- If a user asks about medical risk or injury, suggest consulting a qualified professional.\n\n"

        "STYLE:\n"
        "- Be concise but coach-like.\n"
        "- Avoid vague wellness language.\n"
        "- Quantify insights when possible.\n"
        "- Prioritize clarity over completeness.\n"
    )

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

    assistant_text = rag_zone.call_chat(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
    )

    yield history + [(message, str(assistant_text))]
