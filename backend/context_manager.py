from dataclasses import dataclass

from langchain_core.messages import AIMessage, HumanMessage, trim_messages
from langchain_core.messages.utils import count_tokens_approximately


@dataclass
class ManagedContext:
    messages: list[dict]
    transcript: str
    total_messages: int
    kept_messages: int


class ConversationContextManager:
    def __init__(self, max_tokens: int = 2400):
        self._max_tokens = max_tokens

    def build(
        self,
        messages: list[dict],
        mentor_names: dict[str, str] | None = None,
    ) -> ManagedContext:
        mentor_names = mentor_names or {}
        lc_messages = [msg for msg in (self._to_langchain(m, mentor_names) for m in messages) if msg]
        if not lc_messages:
            return ManagedContext(messages=[], transcript="（暂无）", total_messages=0, kept_messages=0)

        trimmed = trim_messages(
            lc_messages,
            max_tokens=self._max_tokens,
            token_counter=count_tokens_approximately,
            strategy="last",
            start_on="human",
        )
        managed_messages = [self._to_prompt_dict(msg) for msg in trimmed]
        transcript = "\n".join(
            f"- {msg['speaker']}: {msg['content']}" for msg in managed_messages if msg["content"]
        ) or "（暂无）"
        return ManagedContext(
            messages=managed_messages,
            transcript=transcript,
            total_messages=len(lc_messages),
            kept_messages=len(managed_messages),
        )

    def _to_langchain(self, message: dict, mentor_names: dict[str, str]):
        content = (message.get("content") or "").strip()
        if not content:
            return None
        role = message.get("role")
        if role == "user":
            return HumanMessage(content=content, name="user")

        if role == "mentor":
            mentor_id = message.get("mentor_id") or "mentor"
            speaker = mentor_names.get(mentor_id, mentor_id)
            return AIMessage(content=content, name=f"mentor:{speaker}")

        if role == "moderator":
            return AIMessage(content=content, name="moderator")

        return AIMessage(content=content, name=role or "assistant")

    def _to_prompt_dict(self, message) -> dict:
        if message.type == "human":
            return {"role": "user", "speaker": "user", "content": message.content}

        name = getattr(message, "name", None) or "assistant"
        if name.startswith("mentor:"):
            speaker = name.split(":", 1)[1]
        else:
            speaker = name
        return {"role": "assistant", "speaker": speaker, "content": message.content}
