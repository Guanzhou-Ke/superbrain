from collections.abc import AsyncIterator

from backend.mentors import MentorLibrary
from backend.memory import Store
from backend.providers.base import LLMProvider

PHASES = ["independent_review", "debate", "assumptions",
          "research_gap", "experiment_design", "conclusion"]

PHASE_PROMPTS = {
    "assumptions": "以 Markdown 表格列出这个 idea 的隐含假设（假设 | 风险 | 若不成立的后果）。",
    "research_gap": "列出：尚未解决的问题 / 当前方法缺陷 / 潜在创新点。",
    "experiment_design": "给出实验设计：Baseline / Dataset / Metrics / Ablation / Failure Cases。",
    "conclusion": "给出最终结论：研究价值 / 技术价值 / 工程价值 / 商业价值 / 创新等级 / 推荐方向 / 下一步行动。",
}


class DeepReviewOrchestrator:
    def __init__(self, provider: LLMProvider, library: MentorLibrary,
                 store: Store, rounds: int = 3):
        self._p = provider
        self._lib = library
        self._store = store
        self._rounds = rounds

    async def _collect(self, sys: str, user: str) -> str:
        buf = ""
        async for tok in self._p.stream(
                [{"role": "system", "content": sys}, {"role": "user", "content": user}]):
            buf += tok
        return buf

    async def run(self, conversation_id: str, idea: str) -> AsyncIterator[dict]:
        self._store.add_message(conversation_id, "user", idea, mode="review")
        sections: dict[str, str] = {}

        # Phase 1: 独立评审（全员）
        yield {"type": "phase", "name": "independent_review"}
        reviews = []
        for card in self._lib.roster():
            mentor = self._lib.get(card.id)
            sys = self._lib.render_system_prompt(mentor)
            text = ""
            async for tok in self._p.stream(
                    [{"role": "system", "content": sys},
                     {"role": "user", "content": f"独立评审这个想法：{idea}"}]):
                text += tok
                yield {"type": "token", "mentor_id": mentor.id, "text": tok}
            reviews.append(f"{mentor.name}: {text}")
        sections["independent_review"] = "\n\n".join(reviews)

        # Phase 2: 交叉辩论
        yield {"type": "phase", "name": "debate"}
        debate_log = []
        prior = "\n\n".join(reviews)
        for r in range(self._rounds):
            sys = "你是主持人，挑出上面评审中最对立的两个观点，组织一轮针锋相对的辩论，用中文。"
            text = await self._collect(sys, prior + "\n\n（第 %d 轮）" % (r + 1))
            for tok in text:
                yield {"type": "token", "mentor_id": "moderator", "text": tok}
            debate_log.append(text)
            prior = text
        sections["debate"] = "\n\n".join(debate_log)

        # Phases 3-6: 主持人综合阶段
        for name in ["assumptions", "research_gap", "experiment_design", "conclusion"]:
            yield {"type": "phase", "name": name}
            ctx = (f"原始想法：{idea}\n\n"
                   f"评审与辩论摘要：\n{sections['independent_review']}\n{sections['debate']}")
            text = await self._collect(PHASE_PROMPTS[name], ctx)
            for tok in text:
                yield {"type": "token", "mentor_id": "moderator", "text": tok}
            sections[name] = text

        report = self._assemble(idea, sections)
        self._store.save_report(conversation_id, report)
        self._store.add_message(conversation_id, "moderator", report,
                                mentor_id="moderator", mode="review")
        yield {"type": "report", "markdown": report}
        yield {"type": "done"}

    def _assemble(self, idea: str, s: dict) -> str:
        return (
            f"# 深度评审报告\n\n**Idea:** {idea}\n\n"
            f"## 1. 专家独立分析\n{s['independent_review']}\n\n"
            f"## 2. 专家辩论\n{s['debate']}\n\n"
            f"## 3. 隐含假设\n{s['assumptions']}\n\n"
            f"## 4. Research Gap\n{s['research_gap']}\n\n"
            f"## 5. 实验设计\n{s['experiment_design']}\n\n"
            f"## 6. 最终结论\n{s['conclusion']}\n"
        )
