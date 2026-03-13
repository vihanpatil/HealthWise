from collections.abc import Sequence
import json


def build_planner_instruction() -> str:
    return (
        "You are the RootWise agentic planner.\n"
        "Plan retrieval for a sustainability and functional-nutrition assistant.\n"
        "Do not answer the user.\n"
        "Return JSON only with this schema:\n"
        '{'
        '"intent":"recipe|substitution|preservation|sourcing|nutrition|mixed",'
        '"queries":["query 1","query 2","query 3"],'
        '"answer_style":"brief answer framing"'
        '}\n'
        "Rules:\n"
        "- Produce 2 or 3 short retrieval-oriented queries.\n"
        "- Query 1 should stay close to the user's wording.\n"
        "- Query 2 should test an alternate angle like ingredients, restrictions, or zero-waste.\n"
        "- Query 3 is optional and should only be used if it adds a distinct angle.\n"
        "- Output valid JSON only."
    )


def build_planner_input(message: str, history: Sequence[Sequence[str]], constraints: dict) -> str:
    recent_history = []
    for user_msg, assistant_msg in list(history or [])[-2:]:
        recent_history.append(
            {
                "user": str(user_msg)[:300],
                "assistant": str(assistant_msg)[:300],
            }
        )

    return json.dumps(
        {
            "user_question": message,
            "constraints": constraints,
            "recent_history": recent_history,
        },
        ensure_ascii=True,
    )


def build_answer_messages(
    *,
    message: str,
    history,
    constraints: dict,
    evidence: str,
    citation_count: int,
) -> list[dict]:
    truncated_history = ""
    for user_msg, assistant_msg in list(history or [])[-2:]:
        truncated_history += (
            f"User: {str(user_msg)[:300]}\nAssistant: {str(assistant_msg)[:300]}\n"
        )

    system_prompt = (
        "You are RootWise in agentic mode.\n\n"
        "NON-NEGOTIABLE GROUNDING RULES:\n"
        "- Use only the provided evidence.\n"
        "- Do not add unsupported nutrition or health claims.\n"
        "- If a fact is not supported, say so.\n"
        "- Each factual sentence must end with an inline citation.\n"
        f"- You may only cite sources [1] to [{citation_count}].\n"
        "- Cite inline like [1][2].\n"
        "- User constraints are authoritative but must not be cited.\n\n"
        "STYLE:\n"
        "- Keep it concise.\n"
        "- Give 2 or 3 suggestions max.\n"
        "- Prefer ingredients the user already has.\n"
        "- Respect dietary restrictions.\n"
    )

    user_prompt = (
        f"EVIDENCE:\n{evidence}\n\n"
        "USER-SPECIFIC INPUTS:\n"
        f"- Current season: {constraints.get('season') or '(unknown)'}\n"
        f"- User allergies: {constraints.get('restrictions') or '(none provided)'}\n"
        f"- Ingredients on hand: {constraints.get('ingredients') or '(none provided)'}\n"
        f"- User knowledge file: {constraints.get('user_rag_file') or '(none)'}\n\n"
        f"RECENT CONTEXT:\n{truncated_history or '(none)'}\n\n"
        f"USER QUESTION:\n{message}\n\n"
        "Return:\n"
        "- 2 or 3 grounded suggestions max\n"
        "- short explanation only if directly supported\n"
        "- inline citations for factual claims\n"
        "- at most one brief follow-up question\n"
    )

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
