from typing import Dict, List, Literal, TypedDict


class AgenticEvent(TypedDict, total=False):
    event: Literal["trace", "message", "error"]
    data: Dict[str, str]
    history: List[List[str]]
