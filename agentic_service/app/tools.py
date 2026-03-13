from __future__ import annotations

from collections.abc import Iterable

import httpx


async def get_user_constraints(rootwise_backend_url: str) -> dict:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            f"{rootwise_backend_url.rstrip('/')}/api/rootwise/internal/constraints"
        )
        response.raise_for_status()
        return response.json().get("constraints", {})


async def retrieve_rootwise(
    rootwise_backend_url: str,
    query: str,
    top_k: int = 5,
) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{rootwise_backend_url.rstrip('/')}/api/rootwise/internal/retrieve",
            json={"query": query, "top_k": top_k},
        )
        response.raise_for_status()
        return response.json()


def merge_and_dedupe_hits(results: Iterable[dict]) -> list[dict]:
    merged: list[dict] = []
    seen = set()

    for result in results:
        for hit in result.get("hits", []):
            text = (hit.get("text") or "").strip()
            if not text:
                continue
            key = (
                hit.get("file") or "",
                str(hit.get("page") or ""),
                text[:240],
            )
            if key in seen:
                continue
            seen.add(key)
            merged.append(hit)

    return merged


def assess_evidence(hits: list[dict]) -> dict:
    good_hits = [hit for hit in hits if len((hit.get("text") or "").strip()) >= 120]
    unique_sources = {
        f"{hit.get('file') or 'unknown'}::{hit.get('page') or '?'}" for hit in good_hits
    }
    sufficient = len(good_hits) >= 3 or (
        len(good_hits) >= 2 and len(unique_sources) >= 2
    )
    return {
        "sufficient": sufficient,
        "reason": f"{len(good_hits)} substantive chunks across {len(unique_sources)} unique sources",
    }


def format_evidence(hits: list[dict], max_chars_per_chunk: int = 700) -> str:
    blocks = []
    for index, hit in enumerate(hits):
        text = (hit.get("text") or "").strip()
        if not text:
            continue
        if len(text) > max_chars_per_chunk:
            text = text[:max_chars_per_chunk].rstrip() + "..."

        source = hit.get("file") or "unknown"
        page = hit.get("page")
        page_label = str(page) if page is not None else "?"
        blocks.append(f"[{index + 1}] (source: {source}, page: {page_label})\n{text}")
    return "\n\n".join(blocks)


def fallback_queries(message: str, constraints: dict) -> list[str]:
    queries = [message.strip()]
    ingredients = constraints.get("ingredients", "").replace("Ingredients:", "").strip()
    restrictions = constraints.get("restrictions", "").replace(
        "Dietary Restrictions:", ""
    ).strip()
    season = constraints.get("season", "").replace("Season:", "").strip()

    if ingredients:
        queries.append(f"{ingredients} zero-waste recipe ideas")
    elif season:
        queries.append(f"{season} seasonal zero-waste food ideas")

    if restrictions:
        queries.append(f"{message.strip()} {restrictions}")
    else:
        queries.append(f"{message.strip()} preservation sustainability")

    out = []
    seen = set()
    for query in queries:
        clean = " ".join(query.split())
        if clean and clean not in seen:
            seen.add(clean)
            out.append(clean)
    return out[:3]
