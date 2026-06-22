"""Tests for FastAPI entry point and SSE routes."""
import json

from fastapi.testclient import TestClient

from backend.main import create_app
from backend.memory import Store
from backend.mentors import MentorLibrary
from tests.conftest import FakeProvider


def _client():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'
    provider = FakeProvider(scripted=[rj, "hello there"])
    app = create_app(
        provider=provider,
        store=Store(":memory:"),
        library=MentorLibrary("tests/fixtures/mentors"),
    )
    return TestClient(app)


def test_list_mentors():
    c = _client()
    r = c.get("/api/mentors")
    assert r.status_code == 200
    assert {m["id"] for m in r.json()} == {"alice", "bob"}


def test_list_conversations_empty():
    c = _client()
    r = c.get("/api/conversations")
    assert r.status_code == 200
    assert r.json() == []


def test_create_and_list_conversation():
    c = _client()
    r = c.post("/api/conversations", json={"title": "Test Conversation"})
    assert r.status_code == 200
    cid = r.json()["id"]
    assert cid

    r2 = c.get("/api/conversations")
    assert r2.status_code == 200
    assert any(conv["id"] == cid for conv in r2.json())


def test_get_messages_empty():
    c = _client()
    r = c.post("/api/conversations", json={"title": "t"})
    cid = r.json()["id"]
    r2 = c.get(f"/api/conversations/{cid}/messages")
    assert r2.status_code == 200
    assert r2.json() == []


def test_chat_stream_returns_events():
    c = _client()
    cid = c.post("/api/conversations", json={"title": "t"}).json()["id"]
    with c.stream(
        "POST",
        "/api/chat",
        json={"conversation_id": cid, "content": "hi", "mode": "chat"},
    ) as r:
        body = "".join(chunk for chunk in r.iter_text())
    assert "route" in body and "done" in body


def test_chat_creates_conversation_if_no_id():
    """POST /api/chat without conversation_id should create one automatically."""
    rj = '{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'
    provider = FakeProvider(scripted=[rj, "hello there"])
    app = create_app(
        provider=provider,
        store=Store(":memory:"),
        library=MentorLibrary("tests/fixtures/mentors"),
    )
    c = TestClient(app)
    with c.stream(
        "POST",
        "/api/chat",
        json={"content": "hello", "mode": "chat"},
    ) as r:
        body = "".join(chunk for chunk in r.iter_text())
    assert "done" in body
