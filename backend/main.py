import json

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from backend.config import get_settings
from backend.export import (
    format_conversation_markdown,
    markdown_to_pdf_bytes,
    safe_export_filename,
)
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

    @app.get("/api/conversations/{cid}/export")
    def export_conversation(cid: str, format: str = "md"):
        if format not in {"md", "pdf"}:
            raise HTTPException(status_code=400, detail="Unsupported export format")
        conversation = store.get_conversation(cid)
        if conversation is None:
            raise HTTPException(status_code=404, detail="Conversation not found")

        mentor_names = {m.id: m.name for m in library.roster()}
        markdown = format_conversation_markdown(
            conversation,
            store.get_messages(cid),
            store.get_reports(cid),
            mentor_names,
        )
        if format == "md":
            filename = safe_export_filename(conversation["title"], "md")
            return Response(
                markdown,
                media_type="text/markdown; charset=utf-8",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )

        filename = safe_export_filename(conversation["title"], "pdf")
        return Response(
            markdown_to_pdf_bytes(markdown),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @app.delete("/api/conversations/{cid}", status_code=204)
    def delete_conversation(cid: str):
        if not store.delete_conversation(cid):
            raise HTTPException(status_code=404, detail="Conversation not found")
        return Response(status_code=204)

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


if __name__ == "__main__":
    import uvicorn

    s = get_settings()
    uvicorn.run("backend.main:get_app", factory=True, host="0.0.0.0", port=s.port)
