import asyncio
import re
from collections.abc import AsyncIterator

from backend.models import RouteDecision, SpeakerDirective
from backend.mentors import MentorLibrary
from backend.memory import Store
from backend.providers.base import LLMProvider

SILENCE = "[本轮无补充]"


def extract_explicit_memory(user_msg: str) -> tuple[str, str] | None:
    text = user_msg.strip()
    triggers = ["请记住：", "请记住:", "记住：", "记住:", "以后请", "我的偏好是", "我的研究方向是"]
    content = ""
    for trigger in triggers:
        if trigger in text:
            before, after = text.split(trigger, 1)
            if trigger in {"以后请", "我的偏好是", "我的研究方向是"}:
                content = trigger + after
            else:
                content = after
            if before.strip() and trigger.startswith("记住"):
                content = after
            break
    if not content and ("不要再" in text or "别再" in text):
        content = text
    content = content.strip(" \n，。:：")
    if not content:
        return None
    if "研究方向" in content or "方向" in content:
        kind = "direction"
    elif "不要" in content or "别再" in content or "拒绝" in content:
        kind = "rejected_idea"
    else:
        kind = "preference"
    return kind, content


def summarize_conversation_title(user_msg: str, max_chars: int = 28) -> str:
    text = re.sub(r"\s+", " ", user_msg).strip()
    text = re.sub(r"^/review\s+", "", text, flags=re.IGNORECASE).strip()
    text = text.strip(" ，。！？!?：:")
    if len(text) <= max_chars:
        return text or "新会话"
    return text[:max_chars].rstrip(" ，。！？!?：:") + "…"


def is_generic_conversation_title(title: str | None) -> bool:
    if not title:
        return True
    normalized = title.strip().lower()
    return (
        normalized.startswith("conversation ")
        or normalized in {"conversation", "new conversation", "新会话", "未命名会话"}
    )


class ChatOrchestrator:
    def __init__(
        self,
        provider: LLMProvider,
        library: MentorLibrary,
        store: Store,
        max_speakers: int = 4,
    ):
        self._p = provider
        self._lib = library
        self._store = store
        self._max = max_speakers

    def _roster_text(self) -> str:
        return "\n".join(
            f"- {c.id} | {c.name}（{c.title}）| 擅长: {', '.join(c.expertise)} | 信念: {c.belief}"
            for c in self._lib.roster()
        )

    def _long_term_text(self, long_term: list[dict]) -> str:
        if not long_term:
            return "（暂无）"
        return "\n".join(
            f"- {m.get('kind', 'memory')}: {m.get('content', '')}"
            for m in long_term[-20:]
            if m.get("content")
        ) or "（暂无）"

    def _mentor_names(self, mentor_ids: list[str]) -> str:
        names = []
        roster = {c.id: c.name for c in self._lib.roster()}
        for mentor_id in mentor_ids:
            names.append(roster.get(mentor_id, mentor_id))
        return "、".join(names)

    async def route(self, user_msg, context, long_term) -> RouteDecision:
        sys = (
            "你是研究委员会的主持人。根据用户消息，从下面导师名册中挑选本轮最该发言的导师"
            f"（最多 {self._max} 位，可更少），并给每位一句定向指令。"
            '只输出 JSON：{"speakers":[{"mentor_id":...,"directive":...,"order":1}],'
            '"synthesize":bool,"reason":...}。\n'
            "长期记忆会影响路由和指令，但不要在 reason 中逐字复述隐私内容。\n"
            "长期记忆:\n" + self._long_term_text(long_term) + "\n\n"
            "名册:\n" + self._roster_text()
        )
        msgs = [
            {"role": "system", "content": sys},
            {"role": "user", "content": user_msg},
        ]
        raw = await self._p.complete(msgs, temperature=0)
        try:
            start, end = raw.find("{"), raw.rfind("}")
            return RouteDecision.parse_capped(raw[start : end + 1], self._max)
        except Exception:
            cards = self._lib.roster()[: self._max]
            return RouteDecision(
                speakers=[
                    SpeakerDirective(mentor_id=c.id, order=i)
                    for i, c in enumerate(cards)
                ],
                synthesize=False,
                reason="路由降级：全员发言",
            )

    async def _mentor_stream(self, sp, user_msg, queue: asyncio.Queue):
        try:
            mentor = self._lib.get(sp.mentor_id)
            sys = self._lib.render_system_prompt(mentor)
            msgs = [
                {"role": "system", "content": sys},
                {
                    "role": "user",
                    "content": f"用户说：{user_msg}\n\n主持人给你的定向指令：{sp.directive}",
                },
            ]
            await queue.put(
                {
                    "type": "mentor_start",
                    "mentor_id": mentor.id,
                    "name": mentor.name,
                    "color": mentor.color,
                }
            )
            buf = ""
            async for tok in self._p.stream(msgs):
                buf += tok
                await queue.put({"type": "token", "mentor_id": mentor.id, "text": tok})
            silent = buf.strip() == SILENCE
            await queue.put(
                {"type": "mentor_end", "mentor_id": mentor.id, "is_silent": silent}
            )
            return mentor, buf, silent
        except Exception as exc:
            # Error isolation: don't block other mentors
            mentor_id = sp.mentor_id
            await queue.put(
                {
                    "type": "mentor_end",
                    "mentor_id": mentor_id,
                    "is_silent": True,
                    "error": str(exc),
                }
            )
            return None, "", True

    async def run_turn(self, conversation_id: str, user_msg: str) -> AsyncIterator[dict]:
        conversation = self._store.get_conversation(conversation_id)
        if conversation and is_generic_conversation_title(conversation.get("title")):
            self._store.update_conversation_title(
                conversation_id,
                summarize_conversation_title(user_msg),
            )
        self._store.add_message(conversation_id, "user", user_msg)
        memory = extract_explicit_memory(user_msg)
        if memory is not None:
            kind, content = memory
            self._store.add_long_term(kind, content)
            yield {"type": "memory_saved", "kind": kind, "content": content}
        yield {"type": "progress", "status": "routing", "message": "读取长期记忆"}
        long_term = self._store.get_long_term()
        context = self._store.get_messages(conversation_id)
        yield {"type": "progress", "status": "routing", "message": "分析问题并编排导师"}
        decision = await self.route(user_msg, context, long_term)
        invited = self._mentor_names([s.mentor_id for s in decision.speakers])
        if invited:
            yield {"type": "progress", "status": "routing", "message": f"已邀请 {invited} 发言"}
        yield {
            "type": "route",
            "speakers": [s.model_dump() for s in decision.speakers],
            "reason": decision.reason,
        }

        queue: asyncio.Queue = asyncio.Queue()
        tasks = [
            asyncio.create_task(self._mentor_stream(sp, user_msg, queue))
            for sp in decision.speakers
        ]
        yield {"type": "progress", "status": "streaming", "message": "等待导师开始发言"}

        pending = len(tasks)
        ended = 0
        while ended < pending:
            ev = await queue.get()
            yield ev
            if ev["type"] == "mentor_end":
                ended += 1

        results = await asyncio.gather(*tasks)
        for mentor, buf, silent in results:
            if mentor is not None:
                self._store.add_message(
                    conversation_id,
                    "mentor",
                    "" if silent else buf,
                    mentor_id=mentor.id,
                    is_silent=silent,
                )

        if decision.synthesize:
            yield {"type": "progress", "status": "synthesizing", "message": "主持人正在汇总结论"}
            yield {"type": "synthesis_start"}
            spoken = [f"{m.name}: {b}" for m, b, s in results if m is not None and not s]
            sys = "你是主持人，请用中文收敛出：共识 / 分歧 / 待决问题。简洁。"
            msgs = [
                {"role": "system", "content": sys},
                {"role": "user", "content": "\n\n".join(spoken)},
            ]
            buf = ""
            async for tok in self._p.stream(msgs):
                buf += tok
                yield {"type": "token", "mentor_id": "moderator", "text": tok}
            self._store.add_message(
                conversation_id, "moderator", buf, mentor_id="moderator"
            )

        yield {"type": "done"}
