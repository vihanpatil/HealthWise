from __future__ import annotations

import asyncio
import json
import os
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from openai import OpenAI

from app.prompts import (
    build_answer_messages,
    build_planner_input,
    build_planner_instruction,
)
from app.tools import (
    assess_evidence,
    fallback_queries,
    format_evidence,
    get_user_constraints,
    merge_and_dedupe_hits,
    retrieve_rootwise,
)

BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BASE_DIR / ".env")

ROOTWISE_BACKEND_URL = os.getenv("ROOTWISE_BACKEND_URL", "http://127.0.0.1:8000")
APP_NAME = "rootwise-agentic"
USER_ID = "rootwise-user"

app = FastAPI(title="RootWise Agentic Service")


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def get_openai_client() -> OpenAI:
    return OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def adk_model_name() -> str:
    model_name = os.getenv("OPENAI_CHAT_MODEL") or os.getenv(
        "OPENAI_CHAT_MODEL", "gpt-4.1-mini"
    )
    return f"openai/{model_name}"


async def run_planner(message: str, history, constraints: dict) -> dict:
    from google.adk.agents import LlmAgent
    from google.adk.models.lite_llm import LiteLlm
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types as genai_types

    session_service = InMemorySessionService()
    session_id = f"rootwise-agentic-{uuid.uuid4().hex}"
    await session_service.create_session(
        app_name=APP_NAME,
        user_id=USER_ID,
        session_id=session_id,
    )

    agent = LlmAgent(
        name="rootwise_planner",
        model=LiteLlm(model=adk_model_name()),
        instruction=build_planner_instruction(),
        description="Plans RootWise retrieval strategy without directly answering the user.",
    )
    runner = Runner(agent=agent, app_name=APP_NAME, session_service=session_service)

    content = genai_types.Content(
        role="user",
        parts=[genai_types.Part(text=build_planner_input(message, history, constraints))],
    )

    final_text = ""
    async for event in runner.run_async(
        user_id=USER_ID,
        session_id=session_id,
        new_message=content,
    ):
        if event.is_final_response() and event.content and event.content.parts:
            final_text = "".join(part.text or "" for part in event.content.parts)

    data = json.loads(final_text)
    return {
        "intent": str(data.get("intent", "mixed")).strip().lower() or "mixed",
        "queries": [q.strip() for q in data.get("queries", []) if str(q).strip()][:3],
        "answer_style": str(data.get("answer_style", "grounded concise guidance")).strip(),
    }


def generate_answer(message: str, history, constraints: dict, hits: list[dict]) -> str:
    client = get_openai_client()
    messages = build_answer_messages(
        message=message,
        history=history,
        constraints=constraints,
        evidence=format_evidence(hits),
        citation_count=len(hits),
    )
    response = client.chat.completions.create(
        model=os.getenv("OPENAI_CHAT_MODEL", "gpt-4.1-mini"),
        messages=messages,
        temperature=0.2,
    )
    return response.choices[0].message.content or ""


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/agentic/chat/stream")
async def chat_stream(payload: dict):
    message = str(payload.get("message", "")).strip()
    history = payload.get("history", [])
    debug = bool(payload.get("debug", False))

    async def gen():
        try:
            constraints = await get_user_constraints(ROOTWISE_BACKEND_URL)
            if debug:
                yield sse("trace", {"label": "Mode", "detail": "ADK service active"})
                yield sse(
                    "trace",
                    {
                        "label": "Constraints",
                        "detail": f"Ingredients context: {(constraints.get('ingredients') or '(none provided)')[:120]}",
                    },
                )
                await asyncio.sleep(0)

            try:
                plan = await run_planner(message, history, constraints)
            except Exception as exc:
                plan = {
                    "intent": "mixed",
                    "queries": fallback_queries(message, constraints),
                    "answer_style": "grounded concise guidance",
                }
                if debug:
                    yield sse("trace", {"label": "Planner", "detail": f"Fallback plan used: {str(exc)}"})

            queries = plan.get("queries") or fallback_queries(message, constraints)
            queries = queries[:3]

            if debug:
                yield sse("trace", {"label": "Intent", "detail": plan.get("intent", "mixed")})
                yield sse("trace", {"label": "Plan", "detail": f"{len(queries)} retrieval queries prepared"})
                await asyncio.sleep(0)

            retrieval_results = []
            assessment = {"sufficient": False, "reason": "No retrievals executed yet."}

            for index, query in enumerate(queries, start=1):
                retrieval_results.append(await retrieve_rootwise(ROOTWISE_BACKEND_URL, query, top_k=5))
                merged_hits = merge_and_dedupe_hits(retrieval_results)
                assessment = assess_evidence(merged_hits)

                if debug:
                    yield sse("trace", {"label": "Retrieval", "detail": f"Round {index}: {query}"})
                    yield sse("trace", {"label": "Evidence", "detail": assessment["reason"]})
                    await asyncio.sleep(0)

                if assessment["sufficient"] and index >= 2:
                    break

            if not assessment["sufficient"]:
                for query in fallback_queries(message, constraints):
                    if len(retrieval_results) >= 4:
                        break
                    if query in [result["query"] for result in retrieval_results]:
                        continue
                    retrieval_results.append(await retrieve_rootwise(ROOTWISE_BACKEND_URL, query, top_k=4))
                    merged_hits = merge_and_dedupe_hits(retrieval_results)
                    assessment = assess_evidence(merged_hits)
                    if debug:
                        yield sse(
                            "trace",
                            {
                                "label": "Retrieval",
                                "detail": f"Fallback round {len(retrieval_results)}: {query}",
                            },
                        )
                        yield sse("trace", {"label": "Evidence", "detail": assessment["reason"]})
                        await asyncio.sleep(0)
                    if assessment["sufficient"]:
                        break

            merged_hits = merge_and_dedupe_hits(retrieval_results)

            if not merged_hits:
                answer = (
                    "I could not find relevant support in the currently loaded RootWise documents.\n\n"
                    "Try uploading a more relevant TXT/PDF or switch back to classic mode for comparison."
                )
            elif not assessment["sufficient"]:
                answer = (
                    "I found some related material, but not enough strong support to answer confidently from the current documents.\n\n"
                    "Try narrowing the question or adding a more specific source document."
                )
            else:
                answer = generate_answer(message, history, constraints, merged_hits)
                if debug:
                    yield sse(
                        "trace",
                        {
                            "label": "Answer",
                            "detail": f"Generated grounded response from {len(merged_hits)} unique chunks",
                        },
                    )
                    await asyncio.sleep(0)

            updated_history = list(history or []) + [[message, answer]]
            yield sse("message", {"history": updated_history})
            yield sse("done", {"ok": True})
        except Exception as exc:
            yield sse("error", {"error": str(exc)})

    return StreamingResponse(gen(), media_type="text/event-stream")
