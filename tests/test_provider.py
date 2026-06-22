import pytest
from backend.providers.base import LLMProvider
from tests.conftest import FakeProvider


@pytest.mark.asyncio
async def test_fake_provider_streams_words():
    p = FakeProvider(scripted=["hello world foo"])
    chunks = [c async for c in p.stream([{"role": "user", "content": "hi"}])]
    assert "".join(chunks) == "hello world foo"
    assert len(chunks) >= 3  # 按词流式


@pytest.mark.asyncio
async def test_fake_provider_complete_consumes_one_script():
    p = FakeProvider(scripted=["a", "b"])
    assert await p.complete([{"role": "user", "content": "x"}]) == "a"
    assert await p.complete([{"role": "user", "content": "y"}]) == "b"
