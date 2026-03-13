from typing import Literal, TypedDict


class AgenticEvent(TypedDict, total=False):
    event: Literal["trace", "message", "error"]
    data: dict[str, str]
    history: list[list[str]]
