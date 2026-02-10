# DUE TO INCREASED TIME FOR RAG, UPDATE FRONTEND TO SHOW A LOADING/WAITING SCREEN


# backend/app/logic/zonewise_chat.py
import json
import re
from typing import Any, Dict, List, Tuple
from pathlib import Path

from app.config import ZONEWISE_DATA
from app.logic.rag_instance import get_rag
from app.logic.rootwise import call_nvidia_chat

rag_zone = get_rag(str(ZONEWISE_DATA))


def initialize_zonewise_rag() -> str:
    ZONEWISE_DATA.mkdir(parents=True, exist_ok=True)
    return rag_zone.build()


# TODO: uncomment this once we have better data
def _safe_has_good_hits(hits: List[Dict[str, Any]], min_hits: int = 2) -> bool:
    good = [h for h in hits if h.get("text") and len(h["text"].strip()) > 80]
    # remove once more zonewise data is loaded
    return True
    return len(good) >= min_hits


def _extract_json_obj(text: str) -> Dict[str, Any]:
    if not text:
        return {}
    txt = text.strip()
    try:
        return json.loads(txt)
    except Exception:
        pass

    match = re.search(r"\{.*\}", txt, re.DOTALL)
    if not match:
        return {}
    try:
        return json.loads(match.group(0))
    except Exception:
        return {}


def _normalize_text(t: str) -> str:
    return re.sub(r"\s+", " ", (t or "").strip().lower())


def _dedupe_hits(hits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    out: List[Dict[str, Any]] = []
    for h in hits:
        key = (
            str(h.get("file") or ""),
            str(h.get("page") or ""),
            _normalize_text((h.get("text") or "")[:240]),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(h)
    return out


def _tokenize(text: str) -> set:
    tokens = re.findall(r"[a-z0-9]{3,}", (text or "").lower())
    return set(tokens)


def _relevance_score(query: str, text: str) -> int:
    q = _tokenize(query)
    t = _tokenize(text)
    if not q or not t:
        return 0
    return len(q.intersection(t))


def _rerank_hits(query: str, hits: List[Dict[str, Any]], top_k: int = 6) -> List[Dict[str, Any]]:
    ranked = sorted(
        hits,
        key=lambda h: (
            _relevance_score(query, h.get("text") or ""),
            len((h.get("text") or "").strip()),
        ),
        reverse=True,
    )
    return ranked[:top_k]


def _judge_retrieval_and_queries(message: str, hits: List[Dict[str, Any]]) -> Tuple[str, List[str]]:
    evidence = _format_evidence(hits, max_chars_per_chunk=500)
    prompt = (
        "You are a retrieval-quality judge for corrective RAG.\n"
        "Given a user question and retrieved evidence, return strict JSON only:\n"
        '{"quality":"good|weak|bad","queries":["q1","q2","q3"]}\n'
        "Rules:\n"
        "- quality=good only if evidence clearly and directly supports an answer.\n"
        "- queries should be short, keyword-heavy retrieval rewrites.\n"
        "- If quality is good, queries may be an empty list.\n"
        "- Max 3 queries.\n\n"
        f"QUESTION:\n{message}\n\n"
        f"RETRIEVED EVIDENCE:\n{evidence or '(none)'}"
    )
    try:
        raw = call_nvidia_chat(
            [
                {"role": "system", "content": "Return JSON only. No markdown."},
                {"role": "user", "content": prompt},
            ]
        )
        obj = _extract_json_obj(raw)
        quality = str(obj.get("quality", "")).strip().lower()
        if quality not in {"good", "weak", "bad"}:
            quality = "weak"
        queries = [str(q).strip() for q in (obj.get("queries") or []) if str(q).strip()]
        return quality, queries[:3]
    except Exception:
        return "weak", []


def _self_check_answer(message: str, evidence: str, k: int, answer: str) -> str:
    check_prompt = (
        "You are a factual grounding checker.\n"
        "Return strict JSON only:\n"
        '{"verdict":"grounded|needs_revision|unsupported"}\n\n'
        "Criteria:\n"
        "- grounded: all factual claims are supported by evidence and have valid citations [1]..[k].\n"
        "- needs_revision: partly supported but some unsupported/missing citations.\n"
        "- unsupported: evidence cannot support a safe answer.\n\n"
        f"k={k}\n"
        f"QUESTION:\n{message}\n\n"
        f"EVIDENCE:\n{evidence}\n\n"
        f"ANSWER:\n{answer}\n"
    )
    try:
        raw = call_nvidia_chat(
            [
                {"role": "system", "content": "Return JSON only. No markdown."},
                {"role": "user", "content": check_prompt},
            ]
        )
        obj = _extract_json_obj(raw)
        verdict = str(obj.get("verdict", "")).strip().lower()
        if verdict in {"grounded", "needs_revision", "unsupported"}:
            return verdict
        return "needs_revision"
    except Exception:
        return "needs_revision"


def _revise_answer_to_grounded(message: str, evidence: str, k: int, answer: str) -> str:
    revise_system = (
        "You are ZoneWise — a concise assistant for personal health analytics.\n\n"
        "Revise the draft answer to be strictly grounded in evidence.\n"
        "Rules:\n"
        "- Keep only claims explicitly supported by EVIDENCE.\n"
        "- Remove unsupported claims.\n"
        "- Each factual sentence must end with citation(s).\n"
        f"- Only citations [1] to [{k}] are allowed.\n"
        "- If evidence is insufficient, say you cannot confirm from documents.\n"
        "- Keep it short and practical.\n"
    )
    revise_user = (
        f"QUESTION:\n{message}\n\n"
        f"EVIDENCE:\n{evidence}\n\n"
        f"DRAFT ANSWER:\n{answer}\n\n"
        "Return only the revised answer."
    )
    return call_nvidia_chat(
        [
            {"role": "system", "content": revise_system},
            {"role": "user", "content": revise_user},
        ]
    )


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
        # Pass 1: base retrieval
        hits = rag_zone.retrieve(message, top_k=6)
    except Exception as e:
        yield history + [
            (message, f"ZoneWise RAG query failed. {init_msg}. Error: {str(e)}")
        ]
        return

    # Pass 2: retrieval quality check + corrective retrieval if needed
    quality, corrective_queries = _judge_retrieval_and_queries(message, hits)
    if quality != "good" or not _safe_has_good_hits(hits):
        expanded = list(hits)
        for q in corrective_queries:
            try:
                expanded.extend(rag_zone.retrieve(q, top_k=4))
            except Exception:
                continue
        hits = _rerank_hits(message, _dedupe_hits(expanded), top_k=6)

    if not _safe_has_good_hits(hits):
        assistant_text = (
            "I can’t find strong support for that in the ZoneWise documents currently loaded.\n\n"
            "If you add the relevant PDF/TXT to `system_data/zonewise_data`, I’ll answer using only that source."
        )
        yield history + [(message, assistant_text)]
        return

    k = len(hits)
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

    # Pass 3: grounded generation
    assistant_text = call_nvidia_chat(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
    )

    # Pass 4: corrective validation + revision
    verdict = _self_check_answer(message, evidence, k, str(assistant_text))
    if verdict == "unsupported":
        assistant_text = (
            "I can’t confirm a reliable answer from the current ZoneWise evidence.\n\n"
            "Please add more relevant documents, and I’ll answer using those sources only."
        )
    elif verdict == "needs_revision":
        try:
            assistant_text = _revise_answer_to_grounded(
                message, evidence, k, str(assistant_text)
            )
        except Exception:
            assistant_text = str(assistant_text)

    yield history + [(message, str(assistant_text))]
