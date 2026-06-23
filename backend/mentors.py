import glob
import os
from dataclasses import dataclass

import frontmatter

CRITICAL_CONSTITUTION = """【委员会铁律】
- 不为礼貌降低批判性；不轻易认可观点；不只给优点。
- 必须主动寻找失败原因，必须提出更好的替代方案。
- 你不是助手，你是来 challenge 用户、帮他找到顶级研究方向的。"""

STAGE_CONTRACTS = {
    "explore": """【本轮目标：Explore】
- 先帮助用户打开问题空间，不要急着落到执行方案。
- 优先给出不同 framing、可能方向、隐藏假设与值得继续追问的问题。
- 最有价值的输出是：新的角度、值得继续探索的切口、你最想 challenge 的前提。""",
    "clarify": """【本轮目标：Clarify】
- 重点比较候选方向，而不是继续无限发散。
- 帮用户形成判断标准，指出 tradeoff、优先级与仍未澄清的问题。
- 最有价值的输出是：方向差异、关键取舍、用户下一步必须回答的问题。""",
    "decide": """【本轮目标：Decide】
- 重点帮助用户形成研究判断，而不是停留在泛泛观点。
- 明确你当前最支持的判断、为什么、以及它最可能错在哪里。
- 最有价值的输出是：强判断、主要风险、还缺哪些证据。""",
    "plan": """【本轮目标：Plan】
- 默认用户方向已相对清楚，本轮应把判断转成行动。
- 优先给实验、验证、评估、执行顺序，而不是继续宽泛讨论。
- 最有价值的输出是：下一步实验、验证方法、执行风险与避坑建议。""",
}

SIGNAL_CONTRACT = """【表达约束：高信号优先】
- 不要长篇铺陈。默认只说 3 到 5 句。
- 第一件事先给出一个一针见血的判断，不要先讲背景。
- 必须尽量围绕一个具体 case、论文、系统决策或失败例子来说明你的判断。
- 如果你说的内容只是常识、重复别人、没有决策价值，就不要展开，宁可少说。
- 每次发言尽量包含三件事中的两件：关键判断 / 支撑它的 case / 最可能失败的点。"""


@dataclass
class MentorCard:
    id: str
    name: str
    title: str
    expertise: list[str]
    belief: str
    color: str
    model: str | None = None


@dataclass
class Mentor(MentorCard):
    body: str = ""


class MentorLibrary:
    def __init__(self, dir: str = "config/mentors"):
        self._dir = dir
        self._roster: list[MentorCard] | None = None

    def _path(self, mentor_id: str) -> str:
        return os.path.join(self._dir, f"{mentor_id}.md")

    def roster(self) -> list[MentorCard]:
        if self._roster is None:
            cards = []
            for f in sorted(glob.glob(os.path.join(self._dir, "*.md"))):
                post = frontmatter.load(f)
                m = post.metadata
                cards.append(MentorCard(
                    id=m["id"],
                    name=m["name"],
                    title=m["title"],
                    expertise=list(m.get("expertise", [])),
                    belief=m["belief"],
                    color=m["color"],
                    model=m.get("model"),
                ))
            self._roster = cards
        return self._roster

    def get(self, mentor_id: str) -> Mentor:
        path = self._path(mentor_id)
        if not os.path.exists(path):
            raise KeyError(mentor_id)
        post = frontmatter.load(path)
        m = post.metadata
        return Mentor(
            id=m["id"],
            name=m["name"],
            title=m["title"],
            expertise=list(m.get("expertise", [])),
            belief=m["belief"],
            color=m["color"],
            model=m.get("model"),
            body=post.content,
        )

    def render_system_prompt(self, mentor: Mentor, stage: str | None = None) -> str:
        stage_block = STAGE_CONTRACTS.get(stage or "", "")
        return (
            f"你现在扮演：{mentor.name}（{mentor.title}）。\n"
            f"核心信念：{mentor.belief}\n\n"
            f"{mentor.body}\n\n"
            f"{CRITICAL_CONSTITUTION}\n\n"
            f"{stage_block}\n\n"
            f"{SIGNAL_CONTRACT}\n\n"
            f"用中文、第一人称发言。若本轮你确实没有有价值的补充，只输出：[本轮无补充]"
        )
