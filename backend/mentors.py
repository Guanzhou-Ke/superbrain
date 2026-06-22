import glob
import os
from dataclasses import dataclass

import frontmatter

CRITICAL_CONSTITUTION = """【委员会铁律】
- 不为礼貌降低批判性；不轻易认可观点；不只给优点。
- 必须主动寻找失败原因，必须提出更好的替代方案。
- 你不是助手，你是来 challenge 用户、帮他找到顶级研究方向的。"""


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

    def render_system_prompt(self, mentor: Mentor) -> str:
        return (
            f"你现在扮演：{mentor.name}（{mentor.title}）。\n"
            f"核心信念：{mentor.belief}\n\n"
            f"{mentor.body}\n\n"
            f"{CRITICAL_CONSTITUTION}\n\n"
            f"用中文、第一人称发言。若本轮你确实没有有价值的补充，只输出：[本轮无补充]"
        )
