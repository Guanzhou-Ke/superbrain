import os
import re

import frontmatter

from backend.providers.base import LLMProvider
from backend.search import SearchTool

TEMPLATE_GUIDE = """生成一个导师 Markdown 档案。严格输出：
首行 --- 开始的 YAML frontmatter，含 id(英文小写slug)/name/title/expertise(列表)/belief(一句)/color(十六进制)，
随后正文五段：## 你是谁 / ## 你的世界观与信仰 / ## 你如何拆解问题·必问的问题 / ## 你最看不惯什么 / ## 你的语气与口头禅。
正文写丰满、有棱角、第一人称设定。不要编造无法佐证的事实。"""


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", name).strip("-").lower()
    return s or "mentor"


class MentorResearcher:
    """Searches the web for a person and uses an LLM to synthesise a mentor profile."""

    def __init__(self, provider: LLMProvider, search: SearchTool, mentors_dir: str):
        self._p = provider
        self._s = search
        self._dir = mentors_dir

    async def build(self, name: str) -> str:
        """Search → LLM synthesis → write <mentors_dir>/<id>.md. Returns file path."""
        results = await self._s.search(f"{name} 学术主张 著名言论 研究风格")
        evidence = "\n".join(
            f"- {r['title']}: {r['snippet']} ({r['url']})" for r in results
        )
        sys_msg = TEMPLATE_GUIDE
        user_msg = (
            f"导师姓名：{name}\n\n"
            f"可参考的联网资料（可能为空）：\n{evidence or '（无）'}"
        )
        md = await self._p.complete(
            [{"role": "system", "content": sys_msg}, {"role": "user", "content": user_msg}]
        )
        post = frontmatter.loads(md)
        mentor_id = post.metadata.get("id") or _slugify(name)
        post.metadata["id"] = mentor_id
        if results:
            post.metadata["sources"] = [r["url"] for r in results]
        os.makedirs(self._dir, exist_ok=True)
        path = os.path.join(self._dir, f"{mentor_id}.md")
        with open(path, "w", encoding="utf-8") as f:
            f.write(frontmatter.dumps(post))
        return path
