"""Tests for FastAPI entry point and SSE routes."""
import json

from fastapi.testclient import TestClient

from backend.main import create_app
from backend.memory import Store
from backend.mentors import MentorLibrary
from tests.conftest import FakeProvider


def _client():
    return _client_with_store()[0]


def _client_with_store():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'
    provider = FakeProvider(scripted=[rj, "hello there"])
    store = Store(":memory:")
    app = create_app(
        provider=provider,
        store=store,
        library=MentorLibrary("tests/fixtures/mentors"),
    )
    return TestClient(app), store


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


def test_delete_conversation_removes_session_data():
    c, store = _client_with_store()
    cid = c.post("/api/conversations", json={"title": "delete"}).json()["id"]
    store.add_message(cid, "user", "hi")
    store.save_report(cid, "# report")

    r = c.delete(f"/api/conversations/{cid}")

    assert r.status_code == 204
    assert c.get(f"/api/conversations/{cid}/messages").json() == []
    assert all(conv["id"] != cid for conv in c.get("/api/conversations").json())


def test_delete_missing_conversation_returns_404():
    c = _client()

    r = c.delete("/api/conversations/missing")

    assert r.status_code == 404


def test_export_conversation_markdown_includes_messages_and_reports():
    c, store = _client_with_store()
    cid = c.post("/api/conversations", json={"title": "Export Title"}).json()["id"]
    store.add_message(cid, "user", "hello")
    store.add_message(cid, "mentor", "mentor reply", mentor_id="alice")
    store.add_message(cid, "moderator", "summary", mentor_id="moderator")
    store.save_report(cid, "# Review\n\n| A | B |\n| - | - |\n| x | y |")

    r = c.get(f"/api/conversations/{cid}/export?format=md")

    assert r.status_code == 200
    assert "text/markdown" in r.headers["content-type"]
    assert "attachment;" in r.headers["content-disposition"]
    body = r.text
    assert "# Export Title" in body
    assert "## User" in body
    assert "hello" in body
    assert "## Alice" in body
    assert "mentor reply" in body
    assert "## Synthesis" in body
    assert "summary" in body
    assert "## Deep Review Report" in body
    assert "| A | B |" in body


def test_export_conversation_pdf_returns_pdf():
    c, store = _client_with_store()
    cid = c.post("/api/conversations", json={"title": "PDF Title"}).json()["id"]
    store.add_message(cid, "user", "hello")

    r = c.get(f"/api/conversations/{cid}/export?format=pdf")

    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")


def test_export_missing_conversation_returns_404():
    c = _client()

    r = c.get("/api/conversations/missing/export?format=md")

    assert r.status_code == 404


def test_export_unknown_format_returns_400():
    c = _client()
    cid = c.post("/api/conversations", json={"title": "Export Title"}).json()["id"]

    r = c.get(f"/api/conversations/{cid}/export?format=docx")

    assert r.status_code == 400
