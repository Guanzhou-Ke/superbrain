import os
from backend.config import Settings


def test_settings_reads_env(monkeypatch):
    monkeypatch.setenv("LLM_BASE_URL", "https://example/v1")
    monkeypatch.setenv("LLM_API_KEY", "sk-test")
    monkeypatch.setenv("LLM_MODEL", "gemini-3.5-flash")
    s = Settings()
    assert s.llm_base_url == "https://example/v1"
    assert s.llm_model == "gemini-3.5-flash"
    assert s.max_chat_speakers == 4
    assert s.review_rounds == 3


def test_settings_missing_key_raises(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "")
    monkeypatch.setenv("LLM_BASE_URL", "")
    import pytest
    with pytest.raises(Exception):
        Settings().require_llm()
