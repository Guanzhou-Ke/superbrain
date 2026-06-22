import pytest
from backend.providers.base import LLMProvider
from backend.mentors import MentorLibrary
from backend.memory import Store
from backend.orchestrator.deep_review import DeepReviewOrchestrator

LIB = "tests/fixtures/mentors"


class EchoProvider(LLMProvider):
    async def stream(self, messages, model=None, temperature=0.7):
        yield "ok "


@pytest.mark.asyncio
async def test_deep_review_runs_all_phases_and_saves_report():
    store = Store(":memory:")
    orch = DeepReviewOrchestrator(EchoProvider(), MentorLibrary(LIB), store, rounds=2)
    cid = store.create_conversation("t")
    phases, has_report = [], False
    async for ev in orch.run(cid, "我想做无人机自主导航"):
        if ev["type"] == "phase":
            phases.append(ev["name"])
        if ev["type"] == "report":
            has_report = True
    assert phases == ["independent_review", "debate", "assumptions",
                      "research_gap", "experiment_design", "conclusion"]
    assert has_report
    # 报告已落库
    assert store._conn.execute("SELECT COUNT(*) FROM review_reports").fetchone()[0] == 1


@pytest.mark.asyncio
async def test_deep_review_emits_progress_and_mentor_start_events():
    store = Store(":memory:")
    orch = DeepReviewOrchestrator(EchoProvider(), MentorLibrary(LIB), store, rounds=1)
    cid = store.create_conversation("t")

    events = [ev async for ev in orch.run(cid, "我想做无人机自主导航")]
    progress = [ev for ev in events if ev["type"] == "progress"]
    mentor_starts = [ev for ev in events if ev["type"] == "mentor_start"]
    mentor_tokens = [
        ev for ev in events
        if ev["type"] == "token" and ev.get("mentor_id") not in {None, "moderator"}
    ]

    assert progress[0]["message"] == "准备深度评审"
    assert any(ev["message"] == "专家独立分析" for ev in progress)
    assert any(ev["message"] == "主持人组织交叉辩论" for ev in progress)
    assert mentor_starts
    assert mentor_tokens
    assert events.index(mentor_starts[0]) < events.index(mentor_tokens[0])
