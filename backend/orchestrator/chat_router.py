import asyncio
from collections.abc import AsyncIterator

from backend.models import RouteDecision, SpeakerDirective
from backend.mentors import MentorLibrary
from backend.memory import Store
from backend.providers.base import LLMProvider

SILENCE = "[本轮无补充]"


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

    async def route(self, user_msg, context, long_term) -> RouteDecision:
        sys = (
            "你是研究委员会的主持人。根据用户消息，从下面导师名册中挑选本轮最该发言的导师"
            f"（最多 {self._max} 位，可更少），并给每位一句定向指令。"
            '只输出 JSON：{"speakers":[{"mentor_id":...,"directive":...,"order":1}],'
            '"synthesize":bool,"reason":...}。\n名册:\n' + self._roster_text()
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
        self._store.add_message(conversation_id, "user", user_msg)
        long_term = self._store.get_long_term()
        context = self._store.get_messages(conversation_id)
        decision = await self.route(user_msg, context, long_term)
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
