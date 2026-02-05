# backend/app/logic/rootwise.py
import os
import sys
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import List, Optional, Tuple, Any, Dict

import requests
from pdf2image import convert_from_path

from app.config import ROOTWISE_DATA, USER_STATE_DIR
from app.logic.rag_instance import get_rag


# ----------------------------
# Globals
# ----------------------------
user_rag_file: Optional[str] = (
    None  # stored as filename inside USER_STATE_DIR (e.g., "MahyarRAG.txt")
)
rag_root = get_rag(str(ROOTWISE_DATA))

SUPPORTED_EXTS = (".txt", ".pdf")


# ----------------------------
# RAG bootstrap (call this on app startup)
# ----------------------------
def initialize_rootwise_rag() -> str:
    """
    Build a single unified index from ROOTWISE_DATA.
    Call this once on app startup (or after significant doc changes).
    """
    return rag_root.build()


# ----------------------------
# User RAG (writes into USER_STATE_DIR, NOT embedded)
# ----------------------------
def set_user_name(name: str) -> str:
    global user_rag_file
    if not name or not name.strip():
        return "Please enter a valid name."

    filename = f"{name.strip()}RAG.txt"
    user_rag_file = filename

    USER_STATE_DIR.mkdir(parents=True, exist_ok=True)
    path = USER_STATE_DIR / filename

    # Create the file if missing, but DO NOT rebuild index here
    if not path.exists():
        path.write_text(f"{name.strip()}'s session initialized.\n")

    return f"File {filename} ready."


def append_to_user_rag(entry: str) -> str:
    global user_rag_file
    if not user_rag_file:
        return "Please enter your name first."
    if not entry or not entry.strip():
        return "Nothing to add."

    USER_STATE_DIR.mkdir(parents=True, exist_ok=True)
    path = USER_STATE_DIR / user_rag_file

    with open(path, "a") as f:
        f.write(entry.strip() + "\n")

    return "Entry added."


# ----------------------------
# Vision transformer (unchanged)
# ----------------------------
def detect_vegetables(image_path: str):
    VIS_TRANSFORMER_PATH = Path(__file__).parent / "vis_transformer.py"

    try:
        result = subprocess.run(
            [sys.executable, str(VIS_TRANSFORMER_PATH), image_path],
            capture_output=True,
            text=True,
            check=True,
        )
        lines = result.stdout.splitlines()
        vegs = ""
        for line in lines:
            if line.startswith("Identified Vegetables:"):
                items = line.split(":", 1)[1].strip(" []\n")
                vegs = [v.strip("' ") for v in items.split(",") if v.strip()]

        return vegs if vegs else "No vegetables detected."

    except subprocess.CalledProcessError as e:
        return [f"Error: {e.stderr.strip()}"]


def handle_image_upload(image_path: str) -> str:
    if not image_path or not os.path.exists(image_path):
        return "Invalid file path"

    vegs = detect_vegetables(image_path)

    # detect_vegetables sometimes returns a string, sometimes list
    if isinstance(vegs, str):
        return vegs

    return ", ".join([v for v in vegs if v])


# ----------------------------
# Document uploading (copy into ROOTWISE_DATA, rebuild unified index)
# ----------------------------
def load_documents(file_objs) -> str:
    """
    Copies uploaded files into ROOTWISE_DATA and rebuilds the unified index.
    IMPORTANT: does NOT overwrite the index with only uploaded docs.
    """
    try:
        if not file_objs:
            return "No files selected."
        if not isinstance(file_objs, list):
            file_objs = [file_objs]

        ROOTWISE_DATA.mkdir(parents=True, exist_ok=True)

        copied_any = False
        for file_obj in file_objs:
            if not hasattr(file_obj, "name"):
                continue

            file_name = os.path.basename(file_obj.name)
            if not file_name or file_name == "/":
                continue

            if not file_name.endswith(SUPPORTED_EXTS):
                print(f"Skipping unsupported file: {file_name}")
                continue

            dest_path = ROOTWISE_DATA / file_name
            shutil.copyfile(file_obj.name, str(dest_path))
            print(f"Copied file to: {dest_path}")
            copied_any = True

        if not copied_any:
            return "No valid documents were uploaded."

        return rag_root.build()

    except Exception as e:
        return f"Error uploading documents: {str(e)}"


# ----------------------------
# Structured user inputs -> stored as files in USER_STATE_DIR (NOT embedded)
# ----------------------------
def add_to_rag(season: str, ingredients: str, restrictions: str) -> str:
    """
    Writes user inputs as separate files inside USER_STATE_DIR (NOT embedded).
    - Season: overwrite
    - Ingredients: overwrite
    - Restrictions: overwrite
    """
    try:
        USER_STATE_DIR.mkdir(parents=True, exist_ok=True)

        if season and season.strip():
            (USER_STATE_DIR / "given_season.txt").write_text(
                f"Season: {season.strip()}\n"
            )

        if ingredients and ingredients.strip():
            (USER_STATE_DIR / "given_ingredients.txt").write_text(
                f"Ingredients: {ingredients.strip()}\n"
            )

        if restrictions and restrictions.strip():
            (USER_STATE_DIR / "given_restrictions.txt").write_text(
                f"Dietary Restrictions: {restrictions.strip()}\n"
            )

        if not any(
            [
                season and season.strip(),
                ingredients and ingredients.strip(),
                restrictions and restrictions.strip(),
            ]
        ):
            return "No new data provided."

        return "User state saved."

    except Exception as e:
        return f"Error updating user state: {str(e)}"


# ----------------------------
# NVIDIA chat helper (unchanged)
# ----------------------------
def call_nvidia_chat(messages, model: str = "meta/llama3-70b-instruct") -> str:
    url = "https://integrate.api.nvidia.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {os.getenv('NGC_API_KEY')}",
        "Content-Type": "application/json",
    }
    payload = {"model": model, "messages": messages}

    response = requests.post(url, headers=headers, json=payload)
    if response.status_code != 200:
        raise Exception(f"Error: {response.status_code} - {response.json()}")
    return response.json()["choices"][0]["message"]["content"].strip()


# ----------------------------
# Helpers
# ----------------------------
def _read_text_if_exists(path: Path) -> str:
    return path.read_text().strip() if path.exists() else ""


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
        blocks.append(f"[{i+1}] (source: {src}, page: {page_str})\n{txt}")
    return "\n\n".join(blocks)


# ----------------------------
# Main chat handler (grounded + agentic retrieval)
# ----------------------------
def stream_response(message: str, history):
    global user_rag_file

    if history is None:
        history = []

    try:
        rag_root.ensure_ready()
    except Exception as e:
        yield history + [(message, f"RAG not ready. Error: {str(e)}")]
        return

    try:
        # Load user context files (not evidence; just constraints)
        ingredients = _read_text_if_exists(USER_STATE_DIR / "given_ingredients.txt")
        season = _read_text_if_exists(USER_STATE_DIR / "given_season.txt")
        allergies = _read_text_if_exists(USER_STATE_DIR / "given_restrictions.txt")

        # First attempt: retrieve using the original message
        hits = rag_root.retrieve(message, top_k=6)
        k = len(hits)

        # Agentic step: if weak, reformulate once and retry
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
            hits = rag_root.retrieve(reformulated, top_k=6)
            k = len(hits)

        # If still weak, refuse to invent
        if not _safe_has_good_hits(hits):
            assistant_text = (
                "I can’t find strong support for that in the documents currently loaded.\n\n"
                "If you upload the relevant PDF/TXT (or add it to rootwise_data), I’ll answer using only that source."
            )
            yield history + [(message, assistant_text)]
            return

        evidence = _format_evidence(hits)

        # Build recent conversational context (lightweight, non-authoritative)
        truncated_history = ""
        if history:
            for user_msg, assistant_msg in history[-2:]:
                truncated_history += f"User: {str(user_msg)[:300]}\nAssistant: {str(assistant_msg)[:300]}\n"

        system_prompt = (
            "You are RootWise — calm, respectful, and deeply knowledgeable about sustainability, food wisdom, and functional medicine.\n\n"
            "NON-NEGOTIABLE GROUNDING RULES:\n"
            "- You must answer ONLY using the EVIDENCE provided.\n"
            "- Do NOT use general nutrition knowledge or common sense to add health claims.\n"
            "- If the evidence does not explicitly state a fact, say you cannot confirm it from the documents.\n"
            "- Each sentence that contains a factual claim MUST end with at least one citation.\n"
            f"- You may ONLY cite sources in the range [1] to [{k}].\n"
            "- Cite sources inline like ... [1][2]. Do NOT put citations on their own line.\n"
            "- Only cite a source if that specific chunk explicitly supports that specific claim.\n"
            "- Do not reuse citations across unrelated claims.\n"
            "- Never invent citations.\n"
            "- USER-SPECIFIC INPUTS are authoritative constraints and must NOT be cited.\n\n"
            "RESPONSE STYLE:\n"
            "- Keep output concise: 2–3 ideas max.\n"
            "- Prioritize ingredients the user already has.\n"
            "- Never suggest food the user is allergic to.\n"
            "- Avoid medical advice; if user asks health questions, stay within the evidence and suggest consulting a professional.\n"
        )

        user_prompt = (
            f"EVIDENCE:\n{evidence}\n\n"
            "USER-SPECIFIC INPUTS (constraints, not evidence):\n"
            f"- Current season: {season or '(unknown)'}\n"
            f"- User allergies: {allergies or '(none provided)'}\n"
            f"- Ingredients on hand: {ingredients or '(none provided)'}\n"
            f"- User knowledge file: {user_rag_file or '(none)'}\n\n"
            f"RECENT CONTEXT:\n{truncated_history or '(none)'}\n\n"
            f"USER QUESTION:\n{message}\n\n"
            "Return:\n"
            "- 2–3 clear suggestions max\n"
            "- short explanation why (only if directly supported)\n"
            "- citations [1] [2] per suggestion\n"
            "- at most one gentle question at the end (optional)\n"
        )

        assistant_text = call_nvidia_chat(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]
        )

        updated_history = history + [(message, str(assistant_text))]
        yield updated_history

    except Exception as e:
        yield history + [(message, f"Error processing query: {str(e)}")]


# ----------------------------
# Debug / UI helpers (kept)
# ----------------------------
def list_system_data_files() -> List[str]:
    try:
        return rag_root.list_files()
    except Exception as e:
        return [f"Error: {e}"]


def read_selected_file(filename: str) -> Tuple[str, Optional[str]]:
    """
    Returns:
      (text: str, preview_image_path: str|None)
    """
    if not filename:
        return "No file selected.", None

    full_path = ROOTWISE_DATA / filename
    if not full_path.exists():
        return "File not found.", None

    if filename.endswith(".txt"):
        return full_path.read_text(), None

    if filename.endswith(".pdf"):
        try:
            images = convert_from_path(str(full_path), dpi=100)
            os.makedirs("temp_renders", exist_ok=True)

            img = images[0]
            img_path = f"temp_renders/{uuid.uuid4().hex}_page_0.png"
            img.save(img_path, "PNG")

            return "PDF rendered preview available.", img_path

        except Exception as e:
            return f"Error rendering PDF: {str(e)}", None

    return "Unsupported file type.", None


# ----------------------------
# For evaluation.py (grounded retrieval snippet)
# ----------------------------
def retrieve_relevant_context(prompt: str, max_chars: int = 2000) -> str:
    try:
        rag_root.ensure_ready()
    except Exception:
        raise Exception("RAG not initialized. Call initialize_rootwise_rag() first.")

    hits = rag_root.retrieve(prompt, top_k=4)
    if not hits:
        return ""

    text = _format_evidence(hits, max_chars_per_chunk=700)
    return text[:max_chars]
