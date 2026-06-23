import asyncio
import json
from collections.abc import AsyncIterator

from backend.conversation_titles import (
    generate_conversation_title,
    should_generate_conversation_title,
    summarize_conversation_title,
)
from backend.context_manager import ConversationContextManager
from backend.models import RouteDecision, SpeakerDirective, StageDecision
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


class ChatOrchestrator:
    def __init__(
        self,
        provider: LLMProvider,
        library: MentorLibrary,
        store: Store,
        max_speakers: int = 4,
        context_manager: ConversationContextManager | None = None,
    ):
        self._p = provider
        self._lib = library
        self._store = store
        self._max = max_speakers
        self._context = context_manager or ConversationContextManager()

    def _speaker_cap(self, stage: str) -> int:
        stage_caps = {
            "explore": min(self._max, 3),
            "clarify": min(self._max, 3),
            "decide": min(self._max, 2),
            "plan": min(self._max, 2),
        }
        return stage_caps.get(stage, min(self._max, 3))

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

    def _branch_state_text(self, branch_state: dict) -> str:
        return (
            f"- 意图摘要: {branch_state.get('intent_summary') or '（暂无）'}\n"
            f"- 主题范围: {branch_state.get('domain_scope') or '（暂无）'}\n"
            f"- 未解问题: {json.dumps(branch_state.get('open_questions', []), ensure_ascii=False)}\n"
            f"- 已确认约束: {json.dumps(branch_state.get('resolved_constraints', []), ensure_ascii=False)}\n"
            f"- 当前阶段: {branch_state.get('current_stage') or 'explore'}"
        )

    def _is_fork_branch(self, branch_id: str) -> bool:
        branch = self._store.get_branch(branch_id)
        return bool(branch and branch.get("parent_branch_id"))

    def _infer_domain_scope(self, user_msg: str, branch_state: dict) -> str:
        if branch_state.get("domain_scope"):
            return branch_state["domain_scope"]
        text = user_msg.strip()
        if "工业界" in text:
            return "industry-research"
        if any(token in text for token in ("无人机", "具身智能", "机器人")):
            return "physical-ai"
        if any(token in text for token in ("研究者", "做研究", "研究能力")):
            return "research-method"
        return "general"

    def _infer_open_questions(self, user_msg: str, branch_state: dict) -> list[str]:
        existing = list(branch_state.get("open_questions", []))
        text = user_msg.strip()
        if "研究者" in text and not any("学术界还是工业界" in q for q in existing):
            existing.append("用户更关心学术界还是工业界的研究路径")
        if "方案" in text and not any("方案的评价标准" in q for q in existing):
            existing.append("用户要的是研究路线、实验方案，还是职业路径方案的评价标准")
        return existing[:4]

    def _build_branch_context(self, branch_id: str) -> tuple[str, dict]:
        lineage = self._store.get_branch_lineage(branch_id)
        if not lineage:
            return "（暂无）", {
                "intent_summary": "",
                "domain_scope": "",
                "open_questions": [],
                "resolved_constraints": [],
                "current_stage": "explore",
                "last_router_action": "",
            }
        ancestor_summaries = []
        for branch in lineage[:-1]:
            state = self._store.get_branch_state(branch["id"])
            if state.get("intent_summary"):
                ancestor_summaries.append(
                    f"- {branch.get('title') or branch['id']}: {state['intent_summary']}"
                )
        current_state = self._store.get_branch_state(branch_id)
        mentor_names = {c.id: c.name for c in self._lib.roster()}
        local_messages = self._store.get_branch_messages(branch_id)
        local_context = self._context.build(local_messages, mentor_names).transcript
        parts = []
        fork_contexts = []
        for branch in lineage[1:]:
            parent_id = branch.get("parent_branch_id")
            fork_message_id = branch.get("forked_from_message_id")
            if not parent_id or not fork_message_id:
                continue
            parent_messages = self._store.get_branch_messages_until(parent_id, fork_message_id)
            if parent_messages:
                parent_context = self._context.build(parent_messages, mentor_names)
                fork_contexts.append(parent_context.transcript)
        if ancestor_summaries:
            parts.append("继承背景:\n" + "\n".join(ancestor_summaries))
        if fork_contexts:
            parts.append("fork 点之前的对话:\n" + "\n\n".join(fork_contexts))
        parts.append("当前分支状态:\n" + self._branch_state_text(current_state))
        parts.append("当前分支最近消息:\n" + local_context)
        return "\n\n".join(parts), current_state

    def _suggest_next_stage(
        self, stage: str, user_msg: str, context: list[dict]
    ) -> tuple[str, str] | None:
        text = user_msg.strip().lower()
        user_turns = [
            m for m in context
            if m.get("role") == "user" and m.get("content")
        ]

        if stage == "explore":
            if any(token in user_msg for token in ("区别", "取舍", "比较", "哪个", "更适合")):
                return "clarify", "你已经开始比较方向，下一轮更适合进入澄清阶段。"
            if len(user_turns) >= 3:
                return "clarify", "你已经积累了几轮探索，下一轮可以开始明确判断标准。"

        if stage == "clarify":
            if any(token in user_msg for token in ("值不值得", "是否值得", "该不该", "判断", "倾向于", "我更想")):
                return "decide", "你已经在形成偏好，下一轮可以尝试收敛成研究判断。"
            if len(user_turns) >= 4:
                return "decide", "你已经做了多轮比较，下一轮可以进入判断阶段。"

        if stage == "decide":
            if any(token in text for token in ("experiment", "baseline", "ablation", "metric")):
                return "plan", "你已经开始询问验证细节，下一轮适合进入规划阶段。"
            if any(token in user_msg for token in ("实验", "验证", "计划", "下一步", "baseline", "指标", "实现")):
                return "plan", "你已经在追问下一步行动，下一轮适合进入规划阶段。"

        return None

    def _mentor_user_prompt(
        self,
        stage: str,
        user_msg: str,
        directive: str,
        recent_context: str,
        branch_state_text: str,
    ) -> str:
        stage_context = {
            "explore": "当前目标是先打开问题空间，提供不同视角和值得追问的方向。",
            "clarify": "当前目标是帮助用户比较方向、澄清偏好和判断标准。",
            "decide": "当前目标是帮助用户形成更清晰的研究判断。",
            "plan": "当前目标是把已形成的判断转成下一步实验或行动。",
        }
        prefix = ""
        if branch_state_text.strip():
            prefix = f"当前分支状态：\n{branch_state_text}\n\n"
        return (
            prefix
            + "最近上下文：\n"
            f"{recent_context}\n\n"
            f"用户本轮最新消息：{user_msg}\n\n"
            f"本轮阶段：{stage}\n"
            f"{stage_context.get(stage, '')}\n\n"
            "输出要求：先给一句最关键的判断，再尽量用一个具体 case 或失败例子支撑；"
            "如果某部分没有新信息，就不要凑字数。\n\n"
            f"主持人给你的定向指令：{directive}"
        )

    def _synthesis_prompt(self, stage: str) -> str:
        prompts = {
            "explore": "你是主持人。不要复述所有人说了什么，而要筛选信号。请用中文输出 4 个短段：1）最值得展开的判断 2）最有解释力的 case 3）最该收敛的思路 4）下一轮唯一最值得追问的问题。每段 1 到 2 句。",
            "clarify": "你是主持人。不要平均总结。请用中文输出 4 个短段：1）最值得展开的判断 2）最有解释力的 case 3）最该收敛的思路 4）用户下一轮必须回答的问题。每段 1 到 2 句。",
            "decide": "你是主持人。请用中文输出 4 个短段：1）当前最强判断 2）最有解释力的 case 3）最该收敛的思路与主要风险 4）还缺的关键证据。每段 1 到 2 句。",
            "plan": "你是主持人。请用中文输出 4 个短段：1）最值得执行的动作 2）最有解释力的 case 3）最该收敛的思路 4）最小验证路径。每段 1 到 2 句。",
        }
        return prompts.get(stage, "你是主持人。请用中文输出：最值得展开的判断 / 最有解释力的 case / 最该收敛的思路 / 下一轮问题。每段 1 到 2 句。")

    async def infer_stage(
        self,
        user_msg,
        context,
        long_term,
        mentor_names=None,
        branch_context: str | None = None,
    ) -> StageDecision:
        recent = branch_context or self._context.build(context, mentor_names).transcript
        sys = (
            "你是研究思考系统的主持人。请判断用户当前更适合处于哪个阶段："
            "explore / clarify / decide / plan。\n"
            "规则：\n"
            "- explore：用户仍在迷茫、寻找方向、打开问题空间\n"
            "- clarify：用户在比较方向、澄清偏好、形成判断标准\n"
            "- decide：用户已接近收敛，需要形成研究判断\n"
            "- plan：用户已较清楚，需要实验、行动或执行建议\n"
            '只输出 JSON：{"stage":"...","confidence":0-1,"why":"...","framing":"..."}。\n'
            "长期记忆:\n" + self._long_term_text(long_term) + "\n\n"
            "最近对话:\n" + recent
        )
        msgs = [
            {"role": "system", "content": sys},
            {"role": "user", "content": user_msg},
        ]
        raw = await self._p.complete(msgs, temperature=0)
        try:
            start, end = raw.find("{"), raw.rfind("}")
            return StageDecision.model_validate_json(raw[start : end + 1])
        except Exception:
            lowered = user_msg.lower()
            if any(token in lowered for token in ("baseline", "experiment", "plan", "implement")):
                return StageDecision(
                    stage="plan",
                    confidence=0.35,
                    why="阶段判断降级：用户包含明显执行导向词",
                    framing="用户已经在请求行动或实验设计",
                )
            return StageDecision(
                stage="explore",
                confidence=0.2,
                why="阶段判断降级：默认先帮助用户打开问题空间",
                framing="用户仍在探索问题定义和方向空间",
            )

    def _route_prompt(
        self,
        stage: str,
        long_term: list[dict],
        recent_context: str,
        branch_state_text: str,
    ) -> str:
        speaker_cap = self._speaker_cap(stage)
        stage_directives = {
            "explore": (
                "目标是扩展问题空间、暴露不同 framing、挑战隐藏假设。"
                "优先选择视角差异大的专家，不要急着给执行方案。"
                "尽量围绕一个最能说明问题的 case 来展开。"
                "reason 里说明本轮想打开哪些方向。"
            ),
            "clarify": (
                "目标是比较候选方向、帮助用户形成判断标准。"
                "优先选择擅长 tradeoff、问题定义和比较分析的专家。"
                "优先让专家围绕一个能解释差异的 case 发言。"
                "reason 里说明本轮要澄清哪些选择。"
            ),
            "decide": (
                "目标是收敛研究判断、指出共识与主要风险。"
                "优先选择能做价值判断和风险识别的专家。"
                "优先选择能用一两个 decisive case 说明问题的专家。"
                "默认倾向 synthesize=true。"
            ),
            "plan": (
                "目标是给出下一步研究或实验路径。"
                "优先选择更偏工程、评估、实验设计的专家。"
                "优先围绕可执行 case、baseline 或失败先例。"
                "reason 里说明本轮要输出怎样的行动方向。"
            ),
        }
        branch_block = ""
        if branch_state_text.strip():
            branch_block = "当前分支状态:\n" + branch_state_text + "\n\n"
        return (
            "你是研究委员会的主持人。根据用户消息，从下面导师名册中挑选本轮最该发言的导师"
            f"（最多 {speaker_cap} 位，可更少），并给每位一句定向指令。"
            '只输出 JSON：{"speakers":[{"mentor_id":...,"directive":...,"order":1}],'
            '"synthesize":bool,"reason":...}。\n'
            f"当前阶段：{stage}\n"
            f"{stage_directives[stage]}\n"
            "规则：少而准。不要为了热闹而多请人。优先邀请能贡献互补高信号判断的人。\n"
            "长期记忆会影响路由和指令，但不要在 reason 中逐字复述隐私内容。\n"
            + branch_block
            + "长期记忆:\n" + self._long_term_text(long_term) + "\n\n"
            + "最近上下文:\n" + recent_context + "\n\n"
            + "名册:\n" + self._roster_text()
        )

    async def route(
        self,
        user_msg,
        context,
        long_term,
        stage: str = "explore",
        branch_context: str | None = None,
        branch_state: dict | None = None,
    ) -> RouteDecision:
        mentor_names = {c.id: c.name for c in self._lib.roster()}
        managed_context = self._context.build(context, mentor_names)
        recent_context = branch_context or managed_context.transcript
        branch_state_text = self._branch_state_text(branch_state or {}) if branch_state else ""
        sys = self._route_prompt(
            stage,
            long_term,
            recent_context,
            branch_state_text,
        )
        speaker_cap = self._speaker_cap(stage)
        msgs = [
            {"role": "system", "content": sys},
            {"role": "user", "content": user_msg},
        ]
        raw = await self._p.complete(msgs, temperature=0)
        try:
            start, end = raw.find("{"), raw.rfind("}")
            return RouteDecision.parse_capped(raw[start : end + 1], speaker_cap)
        except Exception:
            cards = self._lib.roster()[: speaker_cap]
            return RouteDecision(
                speakers=[
                    SpeakerDirective(mentor_id=c.id, order=i)
                    for i, c in enumerate(cards)
                ],
                synthesize=False,
                reason="路由降级：全员发言",
            )

    async def _mentor_stream(
        self,
        sp,
        user_msg,
        queue: asyncio.Queue,
        stage: str,
        recent_context: str,
        branch_state_text: str,
    ):
        try:
            mentor = self._lib.get(sp.mentor_id)
            sys = self._lib.render_system_prompt(mentor, stage=stage)
            msgs = [
                {"role": "system", "content": sys},
                {
                    "role": "user",
                    "content": self._mentor_user_prompt(
                        stage, user_msg, sp.directive, recent_context, branch_state_text
                    ),
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

    async def run_turn(
        self,
        conversation_id: str,
        user_msg: str,
        requested_mode: str = "chat",
        branch_id: str | None = None,
    ) -> AsyncIterator[dict]:
        branch_id = branch_id or self._store.ensure_branch_for_conversation(conversation_id)
        is_fork_branch = self._is_fork_branch(branch_id)
        conversation = self._store.get_conversation(conversation_id)
        existing_branch_messages = self._store.get_branch_messages(branch_id)
        if (
            conversation
            and not is_fork_branch
            and should_generate_conversation_title(
                conversation.get("title"),
                user_msg,
                existing_branch_messages,
            )
        ):
            title = await generate_conversation_title(self._p, user_msg)
            self._store.update_conversation_title(conversation_id, title)
        self._store.add_message(conversation_id, "user", user_msg, branch_id=branch_id)
        memory = extract_explicit_memory(user_msg)
        if memory is not None:
            kind, content = memory
            self._store.add_long_term(kind, content)
            yield {"type": "memory_saved", "kind": kind, "content": content}
        yield {"type": "progress", "status": "routing", "message": "读取长期记忆"}
        long_term = self._store.get_long_term()
        context = self._store.get_branch_messages(branch_id)
        branch_context = None
        branch_state = None
        if is_fork_branch:
            branch_context, branch_state = self._build_branch_context(branch_id)
        mentor_names = {c.id: c.name for c in self._lib.roster()}
        managed_context = self._context.build(context, mentor_names)
        stage = (
            requested_mode
            if requested_mode in {"explore", "clarify", "decide", "plan"}
            else None
        )
        if stage is None:
            yield {"type": "progress", "status": "routing", "message": "判断当前思考阶段"}
            stage_decision = await self.infer_stage(
                user_msg,
                context,
                long_term,
                mentor_names=mentor_names,
                branch_context=branch_context,
            )
            stage = stage_decision.stage
        else:
            stage_decision = StageDecision(
                stage=stage,
                confidence=1.0,
                why="用户显式选择了当前阶段",
                framing=f"本轮按 {stage} 阶段处理问题",
            )
        if is_fork_branch:
            state_seed = branch_state or self._store.get_branch_state(branch_id)
            self._store.update_branch_state(
                branch_id,
                intent_summary=state_seed.get("intent_summary") or summarize_conversation_title(user_msg, max_chars=40),
                domain_scope=self._infer_domain_scope(user_msg, state_seed),
                open_questions=self._infer_open_questions(user_msg, state_seed),
                current_stage=stage_decision.stage,
                last_router_action="route_experts",
            )
            branch_state = self._store.get_branch_state(branch_id)
        yield {
            "type": "stage",
            "stage": stage_decision.stage,
            "confidence": stage_decision.confidence,
            "why": stage_decision.why,
            "framing": stage_decision.framing,
            "branch_id": branch_id,
        }
        if managed_context.total_messages > managed_context.kept_messages:
            yield {
                "type": "progress",
                "status": "routing",
                "message": (
                    f"已整理最近上下文（保留 {managed_context.kept_messages}/"
                    f"{managed_context.total_messages} 条消息）"
                ),
            }
        next_stage = self._suggest_next_stage(stage_decision.stage, user_msg, context)
        if next_stage is not None:
            to_stage, reason = next_stage
            yield {
                "type": "stage_transition",
                "from_stage": stage_decision.stage,
                "to_stage": to_stage,
                "reason": reason,
            }
        yield {"type": "progress", "status": "routing", "message": "分析问题并编排导师"}
        decision = await self.route(
            user_msg,
            context,
            long_term,
            stage=stage_decision.stage,
            branch_context=branch_context,
            branch_state=branch_state,
        )
        invited = self._mentor_names([s.mentor_id for s in decision.speakers])
        if invited:
            yield {"type": "progress", "status": "routing", "message": f"已邀请 {invited} 发言"}
        yield {
            "type": "route",
            "speakers": [s.model_dump() for s in decision.speakers],
            "reason": decision.reason,
            "branch_id": branch_id,
        }

        queue: asyncio.Queue = asyncio.Queue()
        tasks = [
            asyncio.create_task(
                self._mentor_stream(
                    sp,
                    user_msg,
                    queue,
                    stage_decision.stage,
                    branch_context or managed_context.transcript,
                    self._branch_state_text(branch_state) if branch_state else "",
                )
            )
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
                    branch_id=branch_id,
                )

        if decision.synthesize:
            yield {"type": "progress", "status": "synthesizing", "message": "主持人正在汇总结论"}
            yield {"type": "synthesis_start"}
            spoken = [f"{m.name}: {b}" for m, b, s in results if m is not None and not s]
            sys = self._synthesis_prompt(stage_decision.stage)
            msgs = [
                {"role": "system", "content": sys},
                {"role": "user", "content": "\n\n".join(spoken)},
            ]
            buf = ""
            async for tok in self._p.stream(msgs):
                buf += tok
                yield {"type": "token", "mentor_id": "moderator", "text": tok}
            self._store.add_message(
                conversation_id,
                "moderator",
                buf,
                mentor_id="moderator",
                branch_id=branch_id,
            )

        yield {"type": "done"}
