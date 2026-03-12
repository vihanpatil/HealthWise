from __future__ import annotations

import json

import httpx

from app.config import AGENTIC_SERVICE_URL
from app.logic.rootwise_agentic.types import AgenticEvent


def _parse_sse_chunk(raw_event: str) -> AgenticEvent | None:
    lines = [line for line in raw_event.splitlines() if line]
    event_name = "message"
    data_line = ""

    for line in lines:
        if line.startswith("event:"):
            event_name = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            data_line += line.split(":", 1)[1].strip()

    if not data_line:
        return None

    payload = json.loads(data_line)
    if event_name == "trace":
        return {"event": "trace", "data": payload}
    if event_name == "message":
        return {"event": "message", "history": payload.get("history", [])}
    if event_name == "error":
        return {"event": "error", "data": payload}
    return None


async def stream_agentic_response(message: str, history, debug: bool = False):
    payload = {
        "message": message,
        "history": history or [],
        "debug": debug,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            async with client.stream(
                "POST",
                f"{AGENTIC_SERVICE_URL.rstrip('/')}/agentic/chat/stream",
                json=payload,
            ) as response:
                response.raise_for_status()

                buffer = ""
                async for chunk in response.aiter_text():
                    buffer += chunk
                    parts = buffer.split("\n\n")
                    buffer = parts.pop() or ""

                    for part in parts:
                        event = _parse_sse_chunk(part)
                        if event is None:
                            continue
                        if event["event"] == "error":
                            raise RuntimeError(
                                event.get("data", {}).get("error", "Unknown agentic service error.")
                            )
                        yield event
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text.strip() or str(exc)
        yield {
            "event": "message",
            "history": (history or [])
            + [(message, f"Agentic service error: {detail}")],
        }
    except httpx.HTTPError as exc:
        yield {
            "event": "message",
            "history": (history or [])
            + [
                (
                    message,
                    "Agentic service unavailable. Start the separate agentic service on "
                    f"{AGENTIC_SERVICE_URL}. Original error: {str(exc)}",
                )
            ],
        }
