import json

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from backend.config import get_settings
from backend.memory import Store
from backend.mentors import MentorLibrary
from backend.models import ChatRequest
from backend.orchestrator.chat_router import ChatOrchestrator
from backend.orchestrator.deep_review import DeepReviewOrchestrator
from backend.providers.openai_compat import OpenAICompatProvider


def create_app(provider=None, store=None, library=None) -> FastAPI:
    s = get_settings()
    if provider is None:
        s.require_llm()
        provider = OpenAICompatProvider(s.llm_base_url, s.llm_api_key, s.llm_model)
    store = store or Store(s.db_path)
    library = library or MentorLibrary("config/mentors")

    chat = ChatOrchestrator(provider, library, store, s.max_chat_speakers)
    review = DeepReviewOrchestrator(provider, library, store, s.review_rounds)

    app = FastAPI(title="SuperBrain")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/mentors")
    def mentors():
        return [c.__dict__ for c in library.roster()]

    @app.get("/api/conversations")
    def conversations():
        return store.list_conversations()

    @app.post("/api/conversations")
    def new_conversation(body: dict):
        return {"id": store.create_conversation(body.get("title", "新会话"))}

    @app.get("/api/conversations/{cid}/messages")
    def messages(cid: str):
        return store.get_messages(cid)

    @app.post("/api/chat")
    async def chat_ep(req: ChatRequest):
        cid = req.conversation_id or store.create_conversation(req.content[:20])
        gen = (
            review.run(cid, req.content)
            if req.mode == "review"
            else chat.run_turn(cid, req.content)
        )

        async def event_source():
            async for ev in gen:
                yield {"data": json.dumps(ev, ensure_ascii=False)}

        return EventSourceResponse(event_source())

    return app


app = None


def get_app():
    global app
    if app is None:
        app = create_app()
    return app
