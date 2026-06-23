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
    branch_id: str | None = None
    content: str
    mode: Literal["chat", "explore", "clarify", "decide", "plan", "review"] = "chat"


class BranchCreateRequest(BaseModel):
    parent_branch_id: str | None = None
    forked_from_message_id: str | None = None
    title: str = ""


class StageDecision(BaseModel):
    stage: Literal["explore", "clarify", "decide", "plan"]
    confidence: float = 0.0
    why: str = ""
    framing: str = ""


class MentorReply(BaseModel):
    mentor_id: str
    name: str
    color: str
    content: str
    is_silent: bool = False
