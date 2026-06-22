import os
import pytest
from backend.providers.base import LLMProvider
from backend.search import NullSearch, SearchTool
from backend.researcher import MentorResearcher, _slugify


# ---------------------------------------------------------------------------
# Test doubles
# ---------------------------------------------------------------------------

class FakeSearch(SearchTool):
    async def search(self, query: str) -> list[dict]:
        return [{"title": "t", "url": "http://x", "snippet": "卡帕西是深度学习工程师"}]


VALID_MD = (
    "---\n"
    "id: karpathy\n"
    "name: 安德烈·卡帕西\n"
    "title: 深度学习工程师\n"
    "expertise:\n  - 神经网络\n"
    "belief: 简单可扩展者胜。\n"
    "color: \"#111111\"\n"
    "---\n"
    "## 你是谁\n卡帕西。"
)


class MDProvider(LLMProvider):
    async def stream(self, messages, model=None, temperature=0.7):
        yield VALID_MD


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_build_writes_md(tmp_path):
    r = MentorResearcher(MDProvider(), FakeSearch(), str(tmp_path))
    path = await r.build("安德烈·卡帕西")
    assert os.path.exists(path)
    import frontmatter
    post = frontmatter.load(path)
    assert post.metadata["id"]


@pytest.mark.asyncio
async def test_null_search_disables_gracefully(tmp_path):
    r = MentorResearcher(MDProvider(), NullSearch(), str(tmp_path))
    # NullSearch returns empty list; LLM should still generate without error
    path = await r.build("某人")
    assert os.path.exists(path)


@pytest.mark.asyncio
async def test_build_uses_slugify_as_fallback_id(tmp_path):
    """When LLM output has no id in frontmatter, _slugify(name) is used."""

    class NoIdProvider(LLMProvider):
        async def stream(self, messages, model=None, temperature=0.7):
            yield (
                "---\n"
                "name: 测试人\n"
                "title: Tester\n"
                "---\n"
                "## 你是谁\n测试。"
            )

    r = MentorResearcher(NoIdProvider(), NullSearch(), str(tmp_path))
    path = await r.build("Test Person")
    import frontmatter
    post = frontmatter.load(path)
    assert post.metadata["id"] == "test-person"


@pytest.mark.asyncio
async def test_build_saves_sources_when_search_results_exist(tmp_path):
    r = MentorResearcher(MDProvider(), FakeSearch(), str(tmp_path))
    path = await r.build("安德烈·卡帕西")
    import frontmatter
    post = frontmatter.load(path)
    assert "sources" in post.metadata
    assert "http://x" in post.metadata["sources"]


@pytest.mark.asyncio
async def test_build_returns_correct_path(tmp_path):
    r = MentorResearcher(MDProvider(), FakeSearch(), str(tmp_path))
    path = await r.build("安德烈·卡帕西")
    assert path.endswith("karpathy.md")
    assert str(tmp_path) in path


def test_slugify_ascii():
    assert _slugify("Andrej Karpathy") == "andrej-karpathy"


def test_slugify_chinese_fallback():
    # Chinese chars are non-alphanum → all stripped → falls back to "mentor"
    result = _slugify("安德烈·卡帕西")
    assert result == "mentor"


def test_slugify_empty_string():
    assert _slugify("") == "mentor"


def test_slugify_special_chars():
    assert _slugify("Hello, World!") == "hello-world"
