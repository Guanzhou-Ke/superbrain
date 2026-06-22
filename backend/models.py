from typing import Literal

from pydantic import BaseModel


class SpeakerDirective(BaseModel):
    mentor_id: str
    directive: str = ""
    order: int = 0


class RouteDecision(BaseModel):
    speakers: list[SpeakerDirective] = []
    synthesize: bool = False
    reason: str = ""

    @classmethod
    def parse_capped(cls, raw: str, max_speakers: int) -> "RouteDecision":
        d = cls.model_validate_json(raw)
        d.speakers = sorted(d.speakers, key=lambda s: s.order)[:max_speakers]
        return d


class ChatRequest(BaseModel):
    conversation_id: str | None = None
    content: str
    mode: Literal["chat", "review"] = "chat"


class MentorReply(BaseModel):
    mentor_id: str
    name: str
    color: str
    content: str
    is_silent: bool = False
