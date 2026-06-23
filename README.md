# 🧠 SuperBrain

[![中文 README](https://img.shields.io/badge/README-%E4%B8%AD%E6%96%87-blue)](./README.zh.md)

**SuperBrain is an AI research committee that turns fuzzy ideas into case-backed judgments.**

It is local-first, multi-agent, and built for AI brainstorming, critique, and review.
It is not a generic chatbot. It is designed to help you think through the thing that actually matters.

## ✨ What it does

- Assemble a panel of expert mentors
- Route the right voices into the right conversation
- Keep the discussion focused on one high-value case
- Surface the representative case worth expanding
- Let you probe, compare, or turn that case into an experiment
- Fork branches from any message or report
- Run structured deep reviews
- Save conversations, memory, and reports locally
- Export results to Markdown or PDF

## 🎯 Why it exists

Most chatbots are optimized to answer quickly.
SuperBrain is optimized to help you think better.

The core loop is:

1. Infer the user’s thinking stage
2. Choose the smallest useful expert panel
3. Anchor the discussion on a representative case
4. Expand high-signal ideas
5. Collapse low-signal ideas
6. Push toward a clear judgment

> **High signal expands, low signal collapses.**

## 🚀 Key strengths

- **Case-backed judgment**: the system pushes the conversation toward one decisive case instead of a pile of generic advice.
- **Signal routing**: valuable ideas are expanded, weak ideas are compressed, and noise does not dominate the discussion.
- **Case Spotlight**: representative cases are surfaced in the main chat, with follow-up actions to probe, compare, or convert them into experiments.
- **Forkable research branches**: branch from any message or report, explore an alternative path, and keep the main thread intact.
- **Stage-aware orchestration**: adapts to `explore`, `clarify`, `decide`, and `plan`.
- **Multi-expert critique**: mentors can disagree, challenge assumptions, or stay silent when they have nothing useful to add.
- **Deep review workflow**: independent review, debate, assumptions, research gaps, experiment design, and final conclusion.
- **Long-term memory**: important preferences, directions, and rejected ideas can persist across sessions.
- **Local-first storage**: conversations, messages, review reports, and memory live in SQLite on your machine.
- **Composable mentor library**: each mentor is a Markdown file with frontmatter, easy to edit and grow.
- **Transparent UI**: routing, progress, active speakers, review phases, and extracted insights are all visible.

## 🧩 What makes it different

SuperBrain is not trying to win on “more tokens” or “more answers”.
It is trying to win on **better thinking structure**.

Compared with a normal chatbot, it gives you:

- a clearer problem frame
- a sharper debate around a representative case
- a higher signal-to-noise ratio
- a durable record of how a decision formed
- branching paths when a discussion deserves a different angle

Compared with a generic agent framework, it gives you:

- an opinionated research workflow
- a curated mentor panel
- stage-specific behavior
- a ready-to-use product instead of only primitives

## 🛠 Product shape

- **Frontend**: React + Vite chat interface with multi-speaker streaming, side panels, and review output.
- **Backend**: FastAPI + SSE orchestration layer.
- **Model access**: OpenAI-compatible client through a LiteLLM gateway.
- **Persistence**: SQLite for sessions, messages, reports, and memory.
- **Mentors**: one Markdown file per mentor, loaded from `config/mentors/`.
- **Branches**: forkable conversation paths with branch-level state and context.

## ⚡ Quick start

### Requirements

- macOS or Linux shell
- Python 3.11+
- [`uv`](https://docs.astral.sh/uv/)
- Node.js + npm

### Backend

```bash
uv sync
cp .env.example .env
```

Set the required values in `.env`:

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

Run the backend:

```bash
uv run python -m backend.main
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Then open the Vite URL, usually:

```text
http://localhost:5173
```

## 🧭 Common workflows

### Chat mode

Use chat mode for open-ended brainstorming. The host will infer the stage and route mentors accordingly.

### Review mode

Use `/review <idea>` or switch to review mode for a structured critique.

### Add mentors

Mentors live in `config/mentors/` as Markdown files.

```bash
uv run superbrain add-mentor <url>
```

## 📝 Mentor file format

```yaml
---
id: kaiming
name: 何恺明
title: 视觉表示与深度架构专家
expertise: [视觉表示, 深度架构]
belief: 好的架构应当简单、可扩展、可复用。
color: "#0F766E"
---
```

The body of the file becomes the mentor’s full persona prompt.

## ✅ Testing

```bash
uv run pytest
```

```bash
cd frontend
npm run test
```

```bash
cd frontend
npm run build
npm run lint
```

## 📦 Project layout

```text
superbrain/
├─ backend/
├─ config/mentors/
├─ docs/
├─ frontend/
├─ tests/
├─ pyproject.toml
└─ README.md
```

## 🤝 For contributors

The highest-value work is usually in:

- stronger routing and stage inference
- better mentor prompts and mentor selection
- sharper case-centric discussion behavior
- more useful memory extraction
- better review quality and report structure

## 📌 Status

This project is actively evolving.
Expect the product surface to change as the research workflow becomes sharper.
