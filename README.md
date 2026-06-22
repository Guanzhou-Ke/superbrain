# SuperBrain

SuperBrain is a local multi-agent research committee: chat with a panel of AI mentors, run deep reviews, persist sessions, and export reports.

## Requirements

- macOS/Linux shell
- Python `>=3.11`
- [`uv`](https://docs.astral.sh/uv/) for Python dependency management
- Node.js + npm for the React frontend

## Environment Setup

Install backend dependencies:

```bash
uv sync
```

Install frontend dependencies:

```bash
cd frontend
npm install
```

Create local environment config:

```bash
cp .env.example .env
```

Required `.env` fields:

```bash
PORT=8000
LLM_BASE_URL=...
LLM_API_KEY=...
LLM_MODEL=gemini-3.5-flash
```

Optional:

```bash
TAVILY_API_KEY=...
```

`superbrain.db` is the local SQLite database. It stores conversations, messages, deep review reports, and long-term memory.

## Run Locally

Start the backend:

```bash
uv run python -m backend.main
```

The backend reads `PORT` from `.env`.

Start the frontend in another terminal:

```bash
cd frontend
npm run dev
```

Open the Vite URL, usually:

```text
http://localhost:5173
```

The frontend proxies `/api` to the backend port from `.env`.

## Features

- Multi-mentor chat with streamed SSE responses
- Deep review mode with phase progress and final Markdown report
- Markdown rendering with tables, code, and math via KaTeX
- Session list, delete, and export to Markdown/PDF
- Long-term memory triggered by explicit phrases like `请记住：...`
- Visible streamed status capsules in the chat flow
- Mentor roster loaded from `config/mentors/*.md`

## Mentors

Mentor files live in:

```text
config/mentors/
```

Each file has frontmatter:

```yaml
id: kaiming
name: 何恺明
title: 视觉表示与深度架构专家
expertise: [视觉表示, 深度架构]
belief: 好的架构应当简单、可扩展、可复用。
color: "#0F766E"
```

The Markdown body becomes the full persona prompt. Restart the backend after editing or adding mentor files.

## Tests And Checks

Backend tests:

```bash
uv run pytest
```

Frontend tests:

```bash
cd frontend
npm run test
```

Frontend build and lint:

```bash
cd frontend
npm run build
npm run lint
```

Gateway smoke test, requiring real network/API config:

```bash
uv run pytest -m smoke -s
```

## Common Issues

If new backend routes, mentors, or environment values do not appear, restart the backend.

If the frontend still shows old UI, refresh the browser or restart `npm run dev`.

If `DELETE` or export returns `404` after code changes, confirm the running backend process is the restarted one and that the frontend proxy points to the same `PORT`.

If the build warns about large chunks, it is currently expected because KaTeX fonts and Markdown/math rendering are bundled.

## CLI

Add or research mentors through the CLI:

```bash
uv run superbrain add-mentor <url>
```
