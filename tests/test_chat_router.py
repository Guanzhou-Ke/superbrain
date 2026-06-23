import pytest
from backend.providers.base import LLMProvider
from backend.mentors import MentorLibrary
from backend.memory import Store
from backend.orchestrator.chat_router import ChatOrchestrator

LIB = "tests/fixtures/mentors"


class ScriptProvider(LLMProvider):
    """Provider that serves scripted responses in call order."""

    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    async def stream(self, messages, model=None, temperature=0.7):
        self.calls.append(messages)
        text = self._responses.pop(0) if self._responses else ""
        if text.startswith("{") and text.endswith("}"):
            yield text
            return
        for w in text.split(" "):
            yield w + " "


@pytest.mark.asyncio
async def test_route_parses_and_caps():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'
    provider = ScriptProvider([rj])
    orch = ChatOrchestrator(
        provider,
        MentorLibrary(LIB),
        Store(":memory:"),
        max_speakers=4,
    )
    d = await orch.route("hi", [], [{"kind": "preference", "content": "偏好简洁回答"}], stage="explore")
    assert d.speakers[0].mentor_id == "alice"
    assert "长期记忆" in provider.calls[0][0]["content"]
    assert "偏好简洁回答" in provider.calls[0][0]["content"]


@pytest.mark.asyncio
async def test_run_turn_emits_events_and_persists():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'
    store = Store(":memory:")
    orch = ChatOrchestrator(
        ScriptProvider(['{"stage":"explore","confidence":0.8,"why":"w","framing":"f"}', rj, "hello there"]),
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
async def test_run_turn_generates_abstract_conversation_title_for_generic_session():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'
    store = Store(":memory:")
    orch = ChatOrchestrator(
        ScriptProvider([
            "无人机安全奖励设计",
            '{"stage":"explore","confidence":0.8,"why":"w","framing":"f"}',
            rj,
            "hello there",
        ]),
        MentorLibrary(LIB),
        store,
        max_speakers=4,
    )
    cid = store.create_conversation("新会话")

    _ = [ev async for ev in orch.run_turn(cid, "我想研究无人机强化学习中的安全约束和奖励函数设计")]

    assert store.get_conversation(cid)["title"] == "无人机安全奖励设计"
    assert "会话标题生成器" in orch._p.calls[0][0]["content"]


@pytest.mark.asyncio
async def test_run_turn_streams_safe_progress_events():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":true}'
    store = Store(":memory:")
    orch = ChatOrchestrator(
        ScriptProvider(['{"stage":"decide","confidence":0.8,"why":"w","framing":"f"}', rj, "hello there", "summary"]),
        MentorLibrary(LIB),
        store,
        max_speakers=4,
    )
    cid = store.create_conversation("t")

    events = [ev async for ev in orch.run_turn(cid, "hi")]
    progress = [ev for ev in events if ev["type"] == "progress"]

    assert progress[0]["message"] == "读取长期记忆"
    assert any(ev["message"] == "判断当前思考阶段" for ev in progress)
    assert any(ev["message"] == "分析问题并编排导师" for ev in progress)
    assert any("已邀请" in ev["message"] and "Alice" in ev["message"] for ev in progress)
    assert any(ev["message"] == "主持人正在汇总结论" for ev in progress)
    assert events.index(progress[0]) < events.index(next(ev for ev in events if ev["type"] == "route"))


@pytest.mark.asyncio
async def test_run_turn_records_explicit_memory_and_emits_event():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'
    store = Store(":memory:")
    orch = ChatOrchestrator(
        ScriptProvider(['{"stage":"explore","confidence":0.8,"why":"w","framing":"f"}', rj, "hello there"]),
        MentorLibrary(LIB),
        store,
        max_speakers=4,
    )
    cid = store.create_conversation("t")

    events = [ev async for ev in orch.run_turn(cid, "请记住：我的偏好是回答要简洁")]

    memories = store.get_long_term()
    assert memories[0]["kind"] == "preference"
    assert memories[0]["content"] == "我的偏好是回答要简洁"
    assert {
        "type": "memory_saved",
        "kind": "preference",
        "content": "我的偏好是回答要简洁",
    } in events


@pytest.mark.asyncio
async def test_silence_sentinel_marks_silent():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'
    store = Store(":memory:")
    orch = ChatOrchestrator(
        ScriptProvider(['{"stage":"explore","confidence":0.8,"why":"w","framing":"f"}', rj, "[本轮无补充]"]),
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
        ScriptProvider(["not valid json at all"]),
        MentorLibrary(LIB),
        store,
        max_speakers=4,
    )
    d = await orch.route("hi", [], [], stage="explore")
    # Degraded: should return up to max_speakers speakers from roster
    assert len(d.speakers) >= 1
    assert d.synthesize is False


@pytest.mark.asyncio
async def test_route_caps_speakers_by_stage():
    raw = (
        '{"speakers":['
        '{"mentor_id":"alice","directive":"d1","order":1},'
        '{"mentor_id":"bob","directive":"d2","order":2},'
        '{"mentor_id":"carol","directive":"d3","order":3}'
        '],"synthesize":false}'
    )
    store = Store(":memory:")
    orch = ChatOrchestrator(
        ScriptProvider([raw]),
        MentorLibrary(LIB),
        store,
        max_speakers=4,
    )
    d = await orch.route("给我实验计划", [], [], stage="plan")
    assert len(d.speakers) == 2


@pytest.mark.asyncio
async def test_run_turn_emits_expected_event_sequence():
    """Events must include route, mentor_start, token(s), mentor_end, done."""
    rj = '{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'
    store = Store(":memory:")
    orch = ChatOrchestrator(
        ScriptProvider(['{"stage":"explore","confidence":0.8,"why":"w","framing":"f"}', rj, "hello world"]),
        MentorLibrary(LIB),
        store,
        max_speakers=4,
    )
    cid = store.create_conversation("t")
    events = [ev async for ev in orch.run_turn(cid, "hi")]
    types = [e["type"] for e in events]
    assert types[0] == "progress"
    assert "route" in types
    assert "mentor_start" in types
    assert "token" in types
    assert "mentor_end" in types
    assert types[-1] == "done"


@pytest.mark.asyncio
async def test_infer_stage_parses_json():
    provider = ScriptProvider(['{"stage":"clarify","confidence":0.72,"why":"用户在比较方向","framing":"正在收缩问题"}'])
    orch = ChatOrchestrator(provider, MentorLibrary(LIB), Store(":memory:"), max_speakers=4)
    d = await orch.infer_stage("我在两个方向里摇摆", [], [])
    assert d.stage == "clarify"
    assert d.framing == "正在收缩问题"


@pytest.mark.asyncio
async def test_run_turn_emits_stage_event():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'
    store = Store(":memory:")
    orch = ChatOrchestrator(
        ScriptProvider(['{"stage":"clarify","confidence":0.72,"why":"用户在比较方向","framing":"正在收缩问题"}', rj, "hello world"]),
        MentorLibrary(LIB),
        store,
        max_speakers=4,
    )
    cid = store.create_conversation("t")
    events = [ev async for ev in orch.run_turn(cid, "我在两个方向里摇摆")]
    stage = next(ev for ev in events if ev["type"] == "stage")
    assert stage["stage"] == "clarify"
    assert stage["framing"] == "正在收缩问题"


@pytest.mark.asyncio
async def test_run_turn_skips_stage_inference_for_explicit_mode():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'
    store = Store(":memory:")
    provider = ScriptProvider([rj, "hello world"])
    orch = ChatOrchestrator(provider, MentorLibrary(LIB), store, max_speakers=4)
    cid = store.create_conversation("t")
    events = [ev async for ev in orch.run_turn(cid, "给我下一步实验", requested_mode="plan")]
    stage = next(ev for ev in events if ev["type"] == "stage")
    assert stage["stage"] == "plan"
    assert not any(ev["type"] == "progress" and ev["message"] == "判断当前思考阶段" for ev in events)


@pytest.mark.asyncio
async def test_run_turn_emits_stage_transition_suggestion():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"比较两个方向","order":1}],"synthesize":false}'
    store = Store(":memory:")
    provider = ScriptProvider([rj, "hello world"])
    orch = ChatOrchestrator(provider, MentorLibrary(LIB), store, max_speakers=4)
    cid = store.create_conversation("t")

    events = [ev async for ev in orch.run_turn(cid, "这两个方向有什么区别，哪个更适合？", requested_mode="explore")]

    transition = next(ev for ev in events if ev["type"] == "stage_transition")
    assert transition["from_stage"] == "explore"
    assert transition["to_stage"] == "clarify"


@pytest.mark.asyncio
async def test_run_turn_uses_stage_specific_mentor_prompt():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"比较两个方向","order":1}],"synthesize":false}'
    store = Store(":memory:")
    provider = ScriptProvider([rj, "hello world"])
    orch = ChatOrchestrator(provider, MentorLibrary(LIB), store, max_speakers=4)
    cid = store.create_conversation("t")

    _ = [ev async for ev in orch.run_turn(cid, "我在两个方向里摇摆", requested_mode="clarify")]

    mentor_system = provider.calls[1][0]["content"]
    mentor_user = provider.calls[1][1]["content"]
    assert "【本轮目标：Clarify】" in mentor_system
    assert "当前目标是帮助用户比较方向" in mentor_user


@pytest.mark.asyncio
async def test_route_prompt_includes_recent_context():
    store = Store(":memory:")
    cid = store.create_conversation("t")
    store.add_message(cid, "user", "我想研究具身智能")
    store.add_message(cid, "mentor", "先定义环境和任务", mentor_id="alice")
    provider = ScriptProvider(['{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'])
    orch = ChatOrchestrator(provider, MentorLibrary(LIB), store, max_speakers=4)

    await orch.route("继续", store.get_messages(cid), [], stage="explore")

    route_system = provider.calls[0][0]["content"]
    assert "最近上下文" in route_system
    assert "我想研究具身智能" in route_system
    assert "先定义环境和任务" in route_system


@pytest.mark.asyncio
async def test_root_branch_route_prompt_does_not_include_branch_state_block():
    store = Store(":memory:")
    cid = store.create_conversation("t")
    root = store.ensure_branch_for_conversation(cid)
    store.add_message(cid, "user", "如何做一名研究者", branch_id=root)
    provider = ScriptProvider(['{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'])
    orch = ChatOrchestrator(provider, MentorLibrary(LIB), store, max_speakers=4)

    await orch.route("继续", store.get_branch_messages(root), [], stage="explore")

    route_system = provider.calls[0][0]["content"]
    assert "当前分支状态" not in route_system


@pytest.mark.asyncio
async def test_child_branch_route_prompt_includes_branch_state_block():
    store = Store(":memory:")
    cid = store.create_conversation("t")
    root = store.ensure_branch_for_conversation(cid)
    child = store.create_branch(cid, root, None, "Industrial")
    store.update_branch_state(child, intent_summary="讨论工业界研究路径")
    provider = ScriptProvider(['{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'])
    orch = ChatOrchestrator(provider, MentorLibrary(LIB), store, max_speakers=4)
    branch_context, branch_state = orch._build_branch_context(child)

    await orch.route(
        "继续",
        store.get_branch_messages(child),
        [],
        stage="explore",
        branch_context=branch_context,
        branch_state=branch_state,
    )

    route_system = provider.calls[0][0]["content"]
    assert "当前分支状态" in route_system


@pytest.mark.asyncio
async def test_child_branch_context_inherits_parent_messages_to_fork_point():
    store = Store(":memory:")
    cid = store.create_conversation("t")
    root = store.ensure_branch_for_conversation(cid)
    store.add_message(cid, "user", "parent question", branch_id=root)
    fork_point = store.add_message(cid, "mentor", "parent answer", mentor_id="alice", branch_id=root)
    store.add_message(cid, "user", "parent after fork", branch_id=root)
    child = store.create_branch(cid, root, fork_point, "Fork")
    orch = ChatOrchestrator(ScriptProvider([]), MentorLibrary(LIB), store, max_speakers=4)

    branch_context, _ = orch._build_branch_context(child)

    assert "parent question" in branch_context
    assert "parent answer" in branch_context
    assert "parent after fork" not in branch_context


@pytest.mark.asyncio
async def test_run_turn_passes_recent_context_to_mentor_prompt():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"给出下一步","order":1}],"synthesize":false}'
    store = Store(":memory:")
    cid = store.create_conversation("t")
    store.add_message(cid, "user", "上一轮我已经决定先做仿真")
    store.add_message(cid, "mentor", "那就先固定 benchmark", mentor_id="alice")
    provider = ScriptProvider([rj, "hello world"])
    orch = ChatOrchestrator(provider, MentorLibrary(LIB), store, max_speakers=4)

    _ = [ev async for ev in orch.run_turn(cid, "现在我想补实验设计", requested_mode="plan")]

    mentor_user = provider.calls[1][1]["content"]
    assert "最近上下文" in mentor_user
    assert "上一轮我已经决定先做仿真" in mentor_user
    assert "那就先固定 benchmark" in mentor_user


@pytest.mark.asyncio
async def test_run_turn_updates_branch_state_and_isolates_branch_messages():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"给出下一步","order":1}],"synthesize":false}'
    store = Store(":memory:")
    cid = store.create_conversation("t")
    root = store.ensure_branch_for_conversation(cid)
    child = store.create_branch(cid, root, None, "fork")
    store.add_message(cid, "user", "root context", branch_id=root)
    provider = ScriptProvider([rj, "hello world"])
    orch = ChatOrchestrator(provider, MentorLibrary(LIB), store, max_speakers=4)

    _ = [ev async for ev in orch.run_turn(cid, "child branch question", requested_mode="clarify", branch_id=child)]

    child_state = store.get_branch_state(child)
    child_messages = store.get_branch_messages(child)
    root_messages = store.get_branch_messages(root)
    assert child_state["current_stage"] == "clarify"
    assert child_messages[0]["content"] == "child branch question"
    assert [m["content"] for m in root_messages] == ["root context"]


@pytest.mark.asyncio
async def test_run_turn_uses_stage_specific_synthesis_prompt():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"给出判断","order":1}],"synthesize":true}'
    store = Store(":memory:")
    provider = ScriptProvider([rj, "mentor says", "summary"])
    orch = ChatOrchestrator(provider, MentorLibrary(LIB), store, max_speakers=4)
    cid = store.create_conversation("t")

    _ = [ev async for ev in orch.run_turn(cid, "请帮我判断这个方向", requested_mode="decide")]

    synthesis_system = provider.calls[-1][0]["content"]
    assert "当前最强判断" in synthesis_system
    assert "主要风险" in synthesis_system
