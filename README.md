# SuperBrain

Multi-agent research committee — chat with a panel of AI mentors and run deep reviews.

## Quick Start

### Backend

```bash
# copy and fill in your API keys
cp .env.example .env

# start the API server
uv run uvicorn --factory backend.main:get_app --port 8000
```

### Frontend

```bash
cd frontend
npm install   # first time only
npm run dev
```

Then open the Vite dev server URL (default http://localhost:5173).

## Smoke test

```bash
uv run pytest -m smoke -s
```

## Add a mentor

```bash
uv run superbrain add-mentor <url>
```
