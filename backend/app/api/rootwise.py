# backend/app/api/rootwise.py
from fastapi import APIRouter, UploadFile, File, Query, HTTPException
from fastapi.responses import StreamingResponse
from pathlib import Path
import json
import asyncio

from app.config import ROOTWISE_DATA, USER_STATE_DIR
from app.logic.rootwise import (
    set_user_name,
    append_to_user_rag,
    handle_image_upload,
    add_to_rag,
    load_documents,
    stream_response,
)

router = APIRouter()

@router.post("/user/name")
def set_name(payload: dict):
    name = payload.get("name", "")
    result = set_user_name(name)
    return {"ok": True, "name": result}

@router.post("/notepad/append")
def notepad_append(payload: dict):
    text = payload.get("text", "")
    append_to_user_rag(text)
    return {"ok": True}

@router.post("/veg/detect")
async def veg_detect(image: UploadFile = File(...)):
    # handle_image_upload expects filepath currently; easiest bridge:
    # save temp file -> pass path -> delete
    import tempfile, os
    suffix = "." + (image.filename.split(".")[-1] if image.filename and "." in image.filename else "png")
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await image.read())
        tmp_path = tmp.name
    try:
        result = handle_image_upload(tmp_path)
        return {"ok": True, "detected": result}
    finally:
        try: os.remove(tmp_path)
        except: pass

@router.post("/veg/add")
def veg_add(payload: dict):
    season = payload.get("season", "")
    restrictions = payload.get("restrictions", "")
    ingredients = payload.get("ingredients", "")

    if not ingredients:
        return {"ok": True, "added": 0}

    added = 0
    if "," in ingredients:
        items = ingredients.split(",")
        for veg in items:
            clean = veg.strip(" [']\n\t ")
            if clean:
                add_to_rag(season, clean, restrictions)
                added += 1
    else:
        clean = ingredients.strip(" [']\n\t ")
        if clean:
            add_to_rag(season, clean, restrictions)
            added += 1

    return {"ok": True, "added": added}

@router.post("/rag/add")
def rag_add(payload: dict):
    add_to_rag(
        payload.get("season", ""),
        payload.get("ingredients", ""),
        payload.get("restrictions", ""),
    )
    return {"ok": True}

@router.post("/docs/load")
async def docs_load(files: list[UploadFile] = File(...)):
    # Save uploads to temp, call load_documents(paths)
    import tempfile, os
    paths = []
    try:
        for f in files:
            suffix = "." + (f.filename.split(".")[-1] if f.filename and "." in f.filename else "dat")
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(await f.read())
                paths.append(tmp.name)
        status = load_documents(paths)
        return {"ok": True, "status": status}
    finally:
        for p in paths:
            try: os.remove(p)
            except: pass

def _resolve_scope_dir(scope: str) -> Path:
    s = (scope or "system").strip().lower()
    if s == "system":
        return ROOTWISE_DATA
    if s == "user":
        return USER_STATE_DIR
    raise HTTPException(status_code=400, detail="Invalid scope. Use scope=system or scope=user.")


@router.get("/system/files")
def system_files(scope: str = Query("system")):
    base_dir = _resolve_scope_dir(scope)
    base_dir.mkdir(parents=True, exist_ok=True)

    files = []
    for p in base_dir.iterdir():
        if p.is_file() and p.name.endswith((".txt", ".pdf")):
            files.append(p.name)

    files.sort()
    return {"ok": True, "files": files}


def normalize_history(history):
    # Convert list of tuples -> list of 2-item lists (JSON friendly)
    out = []
    for item in history or []:
        if isinstance(item, (list, tuple)) and len(item) == 2:
            out.append([str(item[0]), str(item[1])])
        else:
            out.append([str(item), ""])
    return out

def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"

@router.post("/chat/stream")
async def chat_stream(payload: dict):
    message = payload.get("message", "")
    history = payload.get("history", [])

    async def gen():
        try:
            for updated_history in stream_response(message, history):
                yield sse("message", {"history": normalize_history(updated_history)})
                await asyncio.sleep(0)
            yield sse("done", {"ok": True})
        except Exception as e:
            yield sse("error", {"error": str(e)})

    return StreamingResponse(gen(), media_type="text/event-stream")
