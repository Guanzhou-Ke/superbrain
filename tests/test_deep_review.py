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
