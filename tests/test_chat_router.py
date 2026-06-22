import pytest
from backend.providers.base import LLMProvider
from backend.mentors import MentorLibrary
from backend.memory import Store
from backend.orchestrator.chat_router import ChatOrchestrator

LIB = "tests/fixtures/mentors"


class ScriptProvider(LLMProvider):
    """Provider that serves route JSON first (via stream/_first flag), then mentor texts."""

    def __init__(self, route_json, mentor_texts):
        self._route = route_json
        self._texts = list(mentor_texts)
        self._first = True

    async def stream(self, messages, model=None, temperature=0.7):
        if self._first:
            self._first = False
            yield self._route
        else:
            text = self._texts.pop(0) if self._texts else ""
            for w in text.split(" "):
                yield w + " "


@pytest.mark.asyncio
async def test_route_parses_and_caps():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'
    orch = ChatOrchestrator(
        ScriptProvider(rj, []),
        MentorLibrary(LIB),
        Store(":memory:"),
        max_speakers=4,
    )
    d = await orch.route("hi", [], [])
    assert d.speakers[0].mentor_id == "alice"


@pytest.mark.asyncio
async def test_run_turn_emits_events_and_persists():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'
    store = Store(":memory:")
    orch = ChatOrchestrator(
        ScriptProvider(rj, ["hello there"]),
        MentorLibrary(LIB),
        store,
        max_speakers=4,
    )
    cid = store.create_conversation("t")
    types = []
    async for ev in orch.run_turn(cid, "hi"):
        types.append(ev["type"])
    assert "route" in types and "done" in types
    msgs = store.get_messages(cid)
    assert any(m["role"] == "mentor" for m in msgs)


@pytest.mark.asyncio
async def test_silence_sentinel_marks_silent():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'
    store = Store(":memory:")
    orch = ChatOrchestrator(
        ScriptProvider(rj, ["[本轮无补充]"]),
        MentorLibrary(LIB),
        store,
        max_speakers=4,
    )
    cid = store.create_conversation("t")
    ends = [ev async for ev in orch.run_turn(cid, "hi") if ev["type"] == "mentor_end"]
    assert ends[0]["is_silent"] is True


@pytest.mark.asyncio
async def test_route_degrades_on_bad_json():
    """If route JSON is invalid, fall back to all roster members."""
    store = Store(":memory:")
    orch = ChatOrchestrator(
        ScriptProvider("not valid json at all", []),
        MentorLibrary(LIB),
        store,
        max_speakers=4,
    )
    d = await orch.route("hi", [], [])
    # Degraded: should return up to max_speakers speakers from roster
    assert len(d.speakers) >= 1
    assert d.synthesize is False


@pytest.mark.asyncio
async def test_run_turn_emits_expected_event_sequence():
    """Events must include route, mentor_start, token(s), mentor_end, done."""
    rj = '{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'
    store = Store(":memory:")
    orch = ChatOrchestrator(
        ScriptProvider(rj, ["hello world"]),
        MentorLibrary(LIB),
        store,
        max_speakers=4,
    )
    cid = store.create_conversation("t")
    events = [ev async for ev in orch.run_turn(cid, "hi")]
    types = [e["type"] for e in events]
    assert types[0] == "route"
    assert "mentor_start" in types
    assert "token" in types
    assert "mentor_end" in types
    assert types[-1] == "done"
