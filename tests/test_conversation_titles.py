import pytest

from backend.conversation_titles import (
    generate_conversation_title,
    is_user_derived_conversation_title,
    normalize_generated_title,
    should_generate_conversation_title,
)
from backend.providers.base import LLMProvider


class TitleProvider(LLMProvider):
    def __init__(self, response: str):
        self.response = response
        self.calls = []

    async def stream(self, messages, model=None, temperature=0.7):
        self.calls.append(messages)
        yield self.response


def test_detects_frontend_prefix_title_as_user_derived():
    assert is_user_derived_conversation_title(
        "我想研究无人机强化学习中的安全约束…",
        "我想研究无人机强化学习中的安全约束和奖励函数设计",
    )


def test_should_only_generate_title_before_first_message():
    assert should_generate_conversation_title("新会话", "如何做一名研究者", [])
    assert not should_generate_conversation_title(
        "新会话",
        "如何做一名研究者",
        [{"role": "user", "content": "已有消息"}],
    )


def test_normalize_generated_title_accepts_json_or_plain_text():
    assert normalize_generated_title('{"title":"研究者能力路径"}', "fallback") == "研究者能力路径"
    assert normalize_generated_title("标题：关于研究者能力路径。", "fallback") == "研究者能力路径"


@pytest.mark.asyncio
async def test_generate_conversation_title_uses_provider_and_cleans_output():
    provider = TitleProvider("“研究者能力路径”")

    title = await generate_conversation_title(provider, "如何做一名研究者")

    assert title == "研究者能力路径"
    assert "会话标题生成器" in provider.calls[0][0]["content"]
