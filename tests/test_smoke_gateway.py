import pytest
from backend.config import get_settings
from backend.providers.openai_compat import OpenAICompatProvider


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_gateway_streams_real():
    s = get_settings()
    s.require_llm()
    p = OpenAICompatProvider(s.llm_base_url, s.llm_api_key, s.llm_model)
    text = ""
    async for c in p.stream([{"role": "user", "content": "用一句话回答：你好吗？"}]):
        text += c
    assert len(text) > 0
    print("\nGATEWAY OK:", text)
