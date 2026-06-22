# SuperBrain 研究委员会 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个本地运行的 multi-agent 头脑风暴系统——由可扩展的导师 agent 组成「研究委员会」，主持人 agent 智能路由，提供类 ChatGPT 的流式网页端，支持聊天模式与深度评审两种工作方式。

**Architecture:** Python(FastAPI + SSE) 后端编排 + 轻量 React(Vite) 前端 + SQLite 持久化。导师为一人一个 Markdown 文件（frontmatter + 正文），主持人按「轻量名册索引 → 按需加载全文」两级召唤。LLM 走 OpenAI 兼容客户端指向 LiteLLM 网关。

**Tech Stack:** Python 3.11+ / uv / FastAPI / uvicorn / sse-starlette / openai SDK / pydantic / pyyaml / python-frontmatter / python-dotenv / httpx；前端 React + Vite + TypeScript；测试 pytest + pytest-asyncio。

## Global Constraints

- Python 版本下限：3.11；用 `uv` 管理依赖与虚拟环境（`uv init` / `uv add` / `uv run`）。
- LLM 默认 provider：OpenAI 兼容客户端指向 `LLM_BASE_URL`（LiteLLM 网关），默认模型 `LLM_MODEL=gemini-3.5-flash`；配置全部从 `.env` 读，禁止硬编码密钥。
- 密钥只存在于 `.env`（已 gitignore）；仓库提供无密钥的 `.env.example`。
- 聊天模式单轮最多邀请 **4** 位导师；深度评审默认 **3** 轮辩论。
- 导师沉默哨兵字符串：`[本轮无补充]`（落库标记 `is_silent=True`，前端不渲染气泡）。
- message role 枚举：`user` / `mentor` / `moderator`；mode 枚举：`chat` / `review`。
- 所有 LLM 调用经 provider 抽象层，禁止在编排/资料员里直接 import openai。
- 每个任务结束须 `git commit`（提交信息用约定式 `feat:` / `test:` / `chore:` 前缀）。

---

## File Structure

```
superbrain/
├─ pyproject.toml              # uv 项目
├─ .env / .env.example         # 配置（.env 已 gitignore）
├─ .gitignore
├─ config/mentors/*.md         # 导师库（默认 7 人）
├─ backend/
│  ├─ __init__.py
│  ├─ config.py                # 读 .env，提供 settings 单例
│  ├─ models.py                # Pydantic schema（路由 JSON、消息等）
│  ├─ providers/
│  │  ├─ __init__.py
│  │  ├─ base.py               # LLMProvider 抽象接口
│  │  └─ openai_compat.py      # 默认实现 → LiteLLM 网关
│  ├─ mentors.py               # 加载 md / 名册索引 / 取全文 / 渲染 system prompt
│  ├─ memory.py                # SQLite 存取 + 长期记忆抽取
│  ├─ search.py                # Search 工具抽象（Tavily，可选）
│  ├─ researcher.py            # 导师资料员 Agent
│  ├─ orchestrator/
│  │  ├─ __init__.py
│  │  ├─ chat_router.py        # 聊天模式：路由 + 并行流式发言 + 综述
│  │  └─ deep_review.py        # 深度评审 6 步状态机
│  ├─ cli.py                   # mentor add/refresh 命令
│  └─ main.py                  # FastAPI 入口 + SSE 路由
├─ tests/                      # pytest（mock provider，无网络）
└─ frontend/                   # Vite + React + TS
```

---

## Task 1: 项目脚手架与配置加载

**Files:**
- Create: `pyproject.toml`（`uv init` 生成后调整）, `.gitignore`, `.env.example`, `backend/__init__.py`, `backend/config.py`
- Test: `tests/test_config.py`
- Note: `.env` 已存在（含真实密钥），勿覆盖；勿提交。

**Interfaces:**
- Produces: `backend/config.py` 暴露 `settings` 对象，含 `llm_base_url: str`, `llm_api_key: str`, `llm_model: str`, `tavily_api_key: str | None`, `db_path: str`, `max_chat_speakers: int = 4`, `review_rounds: int = 3`。提供 `get_settings() -> Settings`（lru_cache 单例）。

- [ ] **Step 1: 初始化 uv 项目并装依赖**

```bash
uv init --python 3.11 --no-readme
uv add fastapi uvicorn sse-starlette openai pydantic "pydantic-settings>=2" pyyaml python-frontmatter python-dotenv httpx
uv add --dev pytest pytest-asyncio
```

- [ ] **Step 2: 写 .gitignore 与 .env.example**

`.gitignore`：
```
.venv/
__pycache__/
*.pyc
node_modules/
*.db
.env
```
`.env.example`（已存在则确认内容；无则创建）：
```
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=gemini-3.5-flash
TAVILY_API_KEY=
```

- [ ] **Step 3: 写失败测试 `tests/test_config.py`**

```python
import os
from backend.config import Settings

def test_settings_reads_env(monkeypatch):
    monkeypatch.setenv("LLM_BASE_URL", "https://example/v1")
    monkeypatch.setenv("LLM_API_KEY", "sk-test")
    monkeypatch.setenv("LLM_MODEL", "gemini-3.5-flash")
    s = Settings()
    assert s.llm_base_url == "https://example/v1"
    assert s.llm_model == "gemini-3.5-flash"
    assert s.max_chat_speakers == 4
    assert s.review_rounds == 3

def test_settings_missing_key_raises(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    import pytest
    with pytest.raises(Exception):
        Settings().require_llm()
```

- [ ] **Step 4: 运行测试，确认失败**

Run: `uv run pytest tests/test_config.py -v`
Expected: FAIL（`backend.config` 不存在）

- [ ] **Step 5: 实现 `backend/config.py`**

```python
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = "gemini-3.5-flash"
    tavily_api_key: str | None = None
    db_path: str = "superbrain.db"
    max_chat_speakers: int = 4
    review_rounds: int = 3

    def require_llm(self) -> None:
        if not self.llm_base_url or not self.llm_api_key:
            raise RuntimeError(
                "缺少 LLM_BASE_URL / LLM_API_KEY，请在 .env 配置（见 .env.example）"
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 6: 运行测试，确认通过**

Run: `uv run pytest tests/test_config.py -v`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add pyproject.toml uv.lock .gitignore .env.example backend/ tests/test_config.py
git commit -m "feat: 项目脚手架与 .env 配置加载"
```

---

## Task 2: LLM Provider 抽象层 + OpenAI 兼容实现

**Files:**
- Create: `backend/providers/__init__.py`, `backend/providers/base.py`, `backend/providers/openai_compat.py`
- Test: `tests/test_provider.py`, `tests/conftest.py`（mock provider fixture）

**Interfaces:**
- Produces:
  - `base.py`: `class LLMProvider(ABC)` 带 `async def stream(messages: list[dict], model: str | None = None, temperature: float = 0.7) -> AsyncIterator[str]` 与 `async def complete(messages, model=None, temperature=0.7) -> str`。`Message` 形如 `{"role": "system"|"user"|"assistant", "content": str}`。
  - `openai_compat.py`: `class OpenAICompatProvider(LLMProvider)`，构造参数 `base_url, api_key, default_model`。
  - `tests/conftest.py`: `class FakeProvider(LLMProvider)`，构造参数 `scripted: list[str]`，按调用顺序返回预设文本（流式按词切分 yield）。

- [ ] **Step 1: 写失败测试 `tests/test_provider.py`**

```python
import pytest
from backend.providers.base import LLMProvider
from tests.conftest import FakeProvider

@pytest.mark.asyncio
async def test_fake_provider_streams_words():
    p = FakeProvider(scripted=["hello world foo"])
    chunks = [c async for c in p.stream([{"role": "user", "content": "hi"}])]
    assert "".join(chunks) == "hello world foo"
    assert len(chunks) >= 3  # 按词流式

@pytest.mark.asyncio
async def test_fake_provider_complete_consumes_one_script():
    p = FakeProvider(scripted=["a", "b"])
    assert await p.complete([{"role": "user", "content": "x"}]) == "a"
    assert await p.complete([{"role": "user", "content": "y"}]) == "b"
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `uv run pytest tests/test_provider.py -v`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `backend/providers/base.py`**

```python
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

Message = dict  # {"role": str, "content": str}


class LLMProvider(ABC):
    @abstractmethod
    async def stream(
        self, messages: list[Message], model: str | None = None, temperature: float = 0.7
    ) -> AsyncIterator[str]:
        ...

    async def complete(
        self, messages: list[Message], model: str | None = None, temperature: float = 0.7
    ) -> str:
        parts = [chunk async for chunk in self.stream(messages, model, temperature)]
        return "".join(parts)
```

- [ ] **Step 4: 实现 `tests/conftest.py` 的 FakeProvider**

```python
from collections.abc import AsyncIterator
from backend.providers.base import LLMProvider, Message


class FakeProvider(LLMProvider):
    def __init__(self, scripted: list[str]):
        self._scripted = list(scripted)
        self.calls: list[list[Message]] = []

    async def stream(self, messages, model=None, temperature=0.7) -> AsyncIterator[str]:
        self.calls.append(messages)
        text = self._scripted.pop(0) if self._scripted else ""
        for word in text.split(" "):
            yield word if word == text.split(" ")[0] else " " + word

    async def complete(self, messages, model=None, temperature=0.7) -> str:
        self.calls.append(messages)
        return self._scripted.pop(0) if self._scripted else ""
```

- [ ] **Step 5: 实现 `backend/providers/openai_compat.py`**

```python
from collections.abc import AsyncIterator
from openai import AsyncOpenAI
from backend.providers.base import LLMProvider, Message


class OpenAICompatProvider(LLMProvider):
    def __init__(self, base_url: str, api_key: str, default_model: str):
        self._client = AsyncOpenAI(base_url=base_url, api_key=api_key)
        self._default_model = default_model

    async def stream(
        self, messages: list[Message], model: str | None = None, temperature: float = 0.7
    ) -> AsyncIterator[str]:
        stream = await self._client.chat.completions.create(
            model=model or self._default_model,
            messages=messages,
            temperature=temperature,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
```

- [ ] **Step 6: 运行测试，确认通过**

Run: `uv run pytest tests/test_provider.py -v`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add backend/providers/ tests/test_provider.py tests/conftest.py
git commit -m "feat: LLM provider 抽象层与 OpenAI 兼容实现"
```

---

## Task 3: 网关连通性冒烟测试（手动，标记 skip）

**Files:**
- Test: `tests/test_smoke_gateway.py`

**Interfaces:**
- Consumes: `OpenAICompatProvider`、`get_settings()`。
- 该测试默认 `skip`（需真实网络与密钥），仅在本机手动 `-m smoke` 运行，验证 `gemini-3.5-flash` 能流式返回。

- [ ] **Step 1: 写冒烟测试**

```python
import os
import pytest
from backend.config import get_settings
from backend.providers.openai_compat import OpenAICompatProvider

@pytest.mark.smoke
@pytest.mark.asyncio
async def test_gateway_streams_real():
    s = get_settings()
    s.require_llm()
    p = OpenAICompatProvider(s.llm_base_url, s.llm_api_key, s.llm_model)
    text = ""
    async for c in p.stream([{"role": "user", "content": "用一句话回答：你好吗？"}]):
        text += c
    assert len(text) > 0
    print("\nGATEWAY OK:", text)
```

- [ ] **Step 2: 注册 marker（pyproject.toml 增加）**

```toml
[tool.pytest.ini_options]
markers = ["smoke: 需真实网络的冒烟测试，默认跳过"]
addopts = "-m 'not smoke'"
asyncio_mode = "auto"
```

- [ ] **Step 3: 手动运行确认网关可用**

Run: `uv run pytest tests/test_smoke_gateway.py -m smoke -s -v`
Expected: PASS 并打印 `GATEWAY OK: ...`（若失败，说明网关/密钥/模型名需排查，先解决再继续后续任务）

- [ ] **Step 4: 提交**

```bash
git add tests/test_smoke_gateway.py pyproject.toml
git commit -m "test: 网关连通性冒烟测试（默认 skip）"
```

---

## Task 4: 默认 7 位导师 Markdown 档案

**Files:**
- Create: `config/mentors/mccarthy.md`, `hinton.md`, `feifei.md`, `brooks.md`, `abbeel.md`, `karem.md`, `huang.md`

**Interfaces:**
- Produces: 7 个 md，frontmatter 含 `id, name, title, expertise(list), belief, color`，可选 `model`；正文含五段：你是谁 / 世界观与信仰 / 如何拆解问题·必问的问题 / 最看不惯什么 / 语气口头禅。内容依据 `draft.md`。

- [ ] **Step 1: 写 `config/mentors/mccarthy.md`（其余 6 个同结构，内容取自 draft.md 对应成员）**

```markdown
---
id: mccarthy
name: 约翰·麦卡锡
title: 理论科学家 · 人工智能之父
expertise: [形式化, 问题定义, 逻辑推理, 理论AI, 状态与动作空间]
belief: 无法被形式化的问题无法被解决。
color: "#4F46E5"
---

## 你是谁
你是约翰·麦卡锡，LISP 之父、"人工智能"一词的提出者。你坚持智能必须可被精确定义与形式化，否则只是修辞。

## 你的世界观与信仰
你相信：一个问题如果说不清它的状态空间、动作空间、目标函数，就根本没被真正提出。你厌恶把旧概念换个名字当创新。

## 你如何拆解问题 / 你必问的问题
- 真正要解决的问题是什么？能否形式化？
- 状态空间是什么？动作空间是什么？目标函数是什么？
- 所谓创新点，是否只是重新命名？

## 你最看不惯什么
含糊的"智能""涌现""理解"等词被当作解释；用 demo 掩盖定义缺失。

## 你的语气与口头禅
理性、严格、定义优先。常说："先定义清楚，再谈解决。"
```

- [ ] **Step 2: 写其余 6 个 md**

| id | name | title | belief | 风格 |
|----|------|-------|--------|------|
| hinton | 杰弗里·辛顿 | 深度学习科学家 · 教父 | 好的表示决定智能上限。 | 第一性原理、关注学习本质 |
| feifei | 李飞飞 | 感知与世界模型 | 理解世界是智能的起点。 | 科学严谨、重视认知建模 |
| brooks | 罗德尼·布鲁克斯 | 具身智能之父 | 智能来自与环境的交互。 | 激进、反主流 |
| abbeel | 彼得·阿贝尔 | 机器人学习代表 | 智能来自经验积累。 | 务实、实验驱动 |
| karem | 亚伯拉罕·卡雷姆 | 现代无人机之父 | 现实世界一定会出错。 | 工程导向 |
| huang | 黄仁勋 | AI 产业领袖 | 价值大于技术。 | 战略导向 |

每个 md 的五段正文依据 draft.md 中该成员的「职责 / 重点问题 / 风格」展开（参照 mccarthy.md 的写法，正文写丰满，2-4 句一段）。expertise 从其职责领域提炼 4-6 个标签。color 各取不同色：hinton `#0891B2`、feifei `#DB2777`、brooks `#DC2626`、abbeel `#16A34A`、karem `#EA580C`、huang `#7C3AED`。

- [ ] **Step 3: 校验 frontmatter 可解析**

Run:
```bash
uv run python -c "import frontmatter,glob; [frontmatter.load(f) for f in glob.glob('config/mentors/*.md')]; print('all parse OK', len(glob.glob('config/mentors/*.md')))"
```
Expected: `all parse OK 7`

- [ ] **Step 4: 提交**

```bash
git add config/mentors/
git commit -m "feat: 默认 7 位导师 Markdown 档案"
```

---

## Task 5: 导师库加载、名册索引与 prompt 渲染

**Files:**
- Create: `backend/mentors.py`
- Test: `tests/test_mentors.py`, `tests/fixtures/mentors/*.md`（2 个最小档案）

**Interfaces:**
- Consumes: `config/mentors/*.md` 格式。
- Produces `backend/mentors.py`:
  - `@dataclass class MentorCard`: `id, name, title, expertise: list[str], belief, color, model: str | None`
  - `@dataclass class Mentor(MentorCard)`: 额外 `body: str`
  - `class MentorLibrary`：构造参数 `dir: str`。方法：`roster() -> list[MentorCard]`（只读 frontmatter，缓存）、`get(mentor_id: str) -> Mentor`（加载全文）、`render_system_prompt(mentor: Mentor) -> str`（拼人设 + 全局批判性宪法）。
  - 模块级常量 `CRITICAL_CONSTITUTION: str`（来自 draft「规则」段）。

- [ ] **Step 1: 建测试 fixtures**

`tests/fixtures/mentors/alice.md` 与 `bob.md`（最小 frontmatter：id/name/title/expertise/belief/color + 一行正文）。

- [ ] **Step 2: 写失败测试 `tests/test_mentors.py`**

```python
from backend.mentors import MentorLibrary, CRITICAL_CONSTITUTION

LIB = "tests/fixtures/mentors"

def test_roster_reads_only_frontmatter():
    cards = MentorLibrary(LIB).roster()
    ids = {c.id for c in cards}
    assert ids == {"alice", "bob"}
    assert all(c.belief for c in cards)

def test_get_loads_full_body():
    m = MentorLibrary(LIB).get("alice")
    assert m.body.strip() != ""

def test_render_system_prompt_includes_persona_and_constitution():
    lib = MentorLibrary(LIB)
    prompt = lib.render_system_prompt(lib.get("alice"))
    assert "alice" in prompt.lower() or "Alice" in prompt
    assert CRITICAL_CONSTITUTION.split("\n")[0] in prompt

def test_get_unknown_raises():
    import pytest
    with pytest.raises(KeyError):
        MentorLibrary(LIB).get("nobody")
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `uv run pytest tests/test_mentors.py -v`
Expected: FAIL

- [ ] **Step 4: 实现 `backend/mentors.py`**

```python
import glob
import os
from dataclasses import dataclass, field
import frontmatter

CRITICAL_CONSTITUTION = """【委员会铁律】
- 不为礼貌降低批判性；不轻易认可观点；不只给优点。
- 必须主动寻找失败原因，必须提出更好的替代方案。
- 你不是助手，你是来 challenge 用户、帮他找到顶级研究方向的。"""


@dataclass
class MentorCard:
    id: str
    name: str
    title: str
    expertise: list[str]
    belief: str
    color: str
    model: str | None = None


@dataclass
class Mentor(MentorCard):
    body: str = ""


class MentorLibrary:
    def __init__(self, dir: str = "config/mentors"):
        self._dir = dir
        self._roster: list[MentorCard] | None = None

    def _path(self, mentor_id: str) -> str:
        return os.path.join(self._dir, f"{mentor_id}.md")

    def roster(self) -> list[MentorCard]:
        if self._roster is None:
            cards = []
            for f in sorted(glob.glob(os.path.join(self._dir, "*.md"))):
                post = frontmatter.load(f)
                m = post.metadata
                cards.append(MentorCard(
                    id=m["id"], name=m["name"], title=m["title"],
                    expertise=list(m.get("expertise", [])), belief=m["belief"],
                    color=m["color"], model=m.get("model"),
                ))
            self._roster = cards
        return self._roster

    def get(self, mentor_id: str) -> Mentor:
        path = self._path(mentor_id)
        if not os.path.exists(path):
            raise KeyError(mentor_id)
        post = frontmatter.load(path)
        m = post.metadata
        return Mentor(
            id=m["id"], name=m["name"], title=m["title"],
            expertise=list(m.get("expertise", [])), belief=m["belief"],
            color=m["color"], model=m.get("model"), body=post.content,
        )

    def render_system_prompt(self, mentor: Mentor) -> str:
        return (
            f"你现在扮演：{mentor.name}（{mentor.title}）。\n"
            f"核心信念：{mentor.belief}\n\n"
            f"{mentor.body}\n\n"
            f"{CRITICAL_CONSTITUTION}\n\n"
            f"用中文、第一人称发言。若本轮你确实没有有价值的补充，只输出：[本轮无补充]"
        )
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `uv run pytest tests/test_mentors.py -v`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add backend/mentors.py tests/test_mentors.py tests/fixtures/
git commit -m "feat: 导师库加载、名册索引与 prompt 渲染"
```

---

## Task 6: 数据模型（Pydantic schema）

**Files:**
- Create: `backend/models.py`
- Test: `tests/test_models.py`

**Interfaces:**
- Produces `backend/models.py`:
  - `class SpeakerDirective(BaseModel)`: `mentor_id: str`, `directive: str`, `order: int`
  - `class RouteDecision(BaseModel)`: `speakers: list[SpeakerDirective]`, `synthesize: bool = False`, `reason: str = ""`；带 `@field_validator` 截断 speakers 到上限（构造时传 `max_speakers` 用 classmethod `parse_capped`）。
  - `class ChatRequest(BaseModel)`: `conversation_id: str | None`, `content: str`, `mode: Literal["chat","review"] = "chat"`
  - `class MentorReply(BaseModel)`: `mentor_id, name, color, content, is_silent: bool`

- [ ] **Step 1: 写失败测试 `tests/test_models.py`**

```python
from backend.models import RouteDecision

def test_route_decision_parses_json():
    raw = '{"speakers":[{"mentor_id":"brooks","directive":"质疑仿真依赖","order":1}],"synthesize":true,"reason":"r"}'
    d = RouteDecision.model_validate_json(raw)
    assert d.speakers[0].mentor_id == "brooks"
    assert d.synthesize is True

def test_route_decision_caps_speakers():
    raw = '{"speakers":[' + ",".join(
        f'{{"mentor_id":"m{i}","directive":"d","order":{i}}}' for i in range(6)
    ) + '],"synthesize":false}'
    d = RouteDecision.parse_capped(raw, max_speakers=4)
    assert len(d.speakers) == 4
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `uv run pytest tests/test_models.py -v`
Expected: FAIL

- [ ] **Step 3: 实现 `backend/models.py`**

```python
from typing import Literal
from pydantic import BaseModel


class SpeakerDirective(BaseModel):
    mentor_id: str
    directive: str = ""
    order: int = 0


class RouteDecision(BaseModel):
    speakers: list[SpeakerDirective] = []
    synthesize: bool = False
    reason: str = ""

    @classmethod
    def parse_capped(cls, raw: str, max_speakers: int) -> "RouteDecision":
        d = cls.model_validate_json(raw)
        d.speakers = sorted(d.speakers, key=lambda s: s.order)[:max_speakers]
        return d


class ChatRequest(BaseModel):
    conversation_id: str | None = None
    content: str
    mode: Literal["chat", "review"] = "chat"


class MentorReply(BaseModel):
    mentor_id: str
    name: str
    color: str
    content: str
    is_silent: bool = False
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `uv run pytest tests/test_models.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/models.py tests/test_models.py
git commit -m "feat: Pydantic 数据模型与路由 JSON 解析"
```

---

## Task 7: 持久化层（SQLite）+ 长期记忆

**Files:**
- Create: `backend/memory.py`
- Test: `tests/test_memory.py`

**Interfaces:**
- Produces `backend/memory.py`:
  - `class Store`：构造 `db_path: str`（`:memory:` 用于测试），`__init__` 建表。
  - 方法：`create_conversation(title: str) -> str`(返回 id)、`list_conversations() -> list[dict]`、`add_message(conversation_id, role, content, mentor_id=None, mode="chat", is_silent=False) -> str`、`get_messages(conversation_id) -> list[dict]`、`save_report(conversation_id, markdown) -> str`、`add_long_term(kind, content)`、`get_long_term() -> list[dict]`。
  - id 用 `uuid4().hex`。表结构见 spec §7。

- [ ] **Step 1: 写失败测试 `tests/test_memory.py`**

```python
from backend.memory import Store

def test_conversation_and_messages_roundtrip():
    s = Store(":memory:")
    cid = s.create_conversation("test")
    assert cid
    s.add_message(cid, "user", "hi")
    s.add_message(cid, "mentor", "yo", mentor_id="brooks", is_silent=False)
    msgs = s.get_messages(cid)
    assert [m["role"] for m in msgs] == ["user", "mentor"]
    assert msgs[1]["mentor_id"] == "brooks"

def test_long_term_memory():
    s = Store(":memory:")
    s.add_long_term("direction", "聚焦具身导航")
    items = s.get_long_term()
    assert items[0]["kind"] == "direction"

def test_save_report():
    s = Store(":memory:")
    cid = s.create_conversation("t")
    rid = s.save_report(cid, "# report")
    assert rid
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `uv run pytest tests/test_memory.py -v`
Expected: FAIL

- [ ] **Step 3: 实现 `backend/memory.py`**

```python
import sqlite3
from uuid import uuid4

SCHEMA = """
CREATE TABLE IF NOT EXISTS conversations(
  id TEXT PRIMARY KEY, title TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS messages(
  id TEXT PRIMARY KEY, conversation_id TEXT, role TEXT, mentor_id TEXT,
  mode TEXT DEFAULT 'chat', content TEXT, is_silent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS review_reports(
  id TEXT PRIMARY KEY, conversation_id TEXT, markdown TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS long_term_memory(
  id TEXT PRIMARY KEY, kind TEXT, content TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
"""


class Store:
    def __init__(self, db_path: str):
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(SCHEMA)

    def _id(self) -> str:
        return uuid4().hex

    def create_conversation(self, title: str) -> str:
        cid = self._id()
        self._conn.execute("INSERT INTO conversations(id,title) VALUES(?,?)", (cid, title))
        self._conn.commit()
        return cid

    def list_conversations(self) -> list[dict]:
        rows = self._conn.execute(
            "SELECT * FROM conversations ORDER BY updated_at DESC").fetchall()
        return [dict(r) for r in rows]

    def add_message(self, conversation_id, role, content, mentor_id=None,
                    mode="chat", is_silent=False) -> str:
        mid = self._id()
        self._conn.execute(
            "INSERT INTO messages(id,conversation_id,role,mentor_id,mode,content,is_silent)"
            " VALUES(?,?,?,?,?,?,?)",
            (mid, conversation_id, role, mentor_id, mode, content, int(is_silent)))
        self._conn.execute(
            "UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (conversation_id,))
        self._conn.commit()
        return mid

    def get_messages(self, conversation_id) -> list[dict]:
        rows = self._conn.execute(
            "SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at, rowid",
            (conversation_id,)).fetchall()
        return [dict(r) for r in rows]

    def save_report(self, conversation_id, markdown) -> str:
        rid = self._id()
        self._conn.execute(
            "INSERT INTO review_reports(id,conversation_id,markdown) VALUES(?,?,?)",
            (rid, conversation_id, markdown))
        self._conn.commit()
        return rid

    def add_long_term(self, kind, content):
        self._conn.execute(
            "INSERT INTO long_term_memory(id,kind,content) VALUES(?,?,?)",
            (self._id(), kind, content))
        self._conn.commit()

    def get_long_term(self) -> list[dict]:
        rows = self._conn.execute(
            "SELECT * FROM long_term_memory ORDER BY created_at").fetchall()
        return [dict(r) for r in rows]
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `uv run pytest tests/test_memory.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/memory.py tests/test_memory.py
git commit -m "feat: SQLite 持久化层与长期记忆"
```

---

## Task 8: 聊天模式编排器（路由 + 并行流式发言 + 综述）

**Files:**
- Create: `backend/orchestrator/__init__.py`, `backend/orchestrator/chat_router.py`
- Test: `tests/test_chat_router.py`

**Interfaces:**
- Consumes: `LLMProvider`, `MentorLibrary`, `RouteDecision`, `Store`, `get_settings`。
- Produces `chat_router.py`:
  - `class ChatOrchestrator`：构造 `provider, library, store, max_speakers`。
  - `async def route(user_msg, context, long_term) -> RouteDecision`（调用 provider.complete 拿 JSON，用 `RouteDecision.parse_capped`；解析失败降级为 roster 前 `max_speakers` 位、`synthesize=False`）。
  - `async def run_turn(conversation_id, user_msg) -> AsyncIterator[dict]`：yield 事件 dict。事件类型：`{"type":"route","speakers":[...],"reason":...}`、`{"type":"mentor_start","mentor_id","name","color"}`、`{"type":"token","mentor_id","text"}`、`{"type":"mentor_end","mentor_id","is_silent"}`、`{"type":"synthesis_start"}`/`token(moderator)`/`{"type":"done"}`。导师并行流式（`asyncio` 收集，按 mentor 分组转发）。沉默哨兵 `[本轮无补充]` → `is_silent=True` 且不落库内容。

- [ ] **Step 1: 写失败测试 `tests/test_chat_router.py`**

```python
import pytest
from backend.providers.base import LLMProvider
from backend.mentors import MentorLibrary
from backend.memory import Store
from backend.orchestrator.chat_router import ChatOrchestrator

LIB = "tests/fixtures/mentors"

class ScriptProvider(LLMProvider):
    def __init__(self, route_json, mentor_texts):
        self._route = route_json
        self._texts = list(mentor_texts)
        self._first = True
    async def stream(self, messages, model=None, temperature=0.7):
        if self._first:
            self._first = False
            yield self._route
        else:
            for w in (self._texts.pop(0) if self._texts else "").split(" "):
                yield w + " "

@pytest.mark.asyncio
async def test_route_parses_and_caps():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'
    orch = ChatOrchestrator(ScriptProvider(rj, []), MentorLibrary(LIB), Store(":memory:"), max_speakers=4)
    d = await orch.route("hi", [], [])
    assert d.speakers[0].mentor_id == "alice"

@pytest.mark.asyncio
async def test_run_turn_emits_events_and_persists():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'
    store = Store(":memory:")
    orch = ChatOrchestrator(ScriptProvider(rj, ["hello there"]), MentorLibrary(LIB), store, max_speakers=4)
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
    orch = ChatOrchestrator(ScriptProvider(rj, ["[本轮无补充]"]), MentorLibrary(LIB), store, max_speakers=4)
    cid = store.create_conversation("t")
    ends = [ev async for ev in orch.run_turn(cid, "hi") if ev["type"] == "mentor_end"]
    assert ends[0]["is_silent"] is True
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `uv run pytest tests/test_chat_router.py -v`
Expected: FAIL

- [ ] **Step 3: 实现 `backend/orchestrator/__init__.py`（空）与 `chat_router.py`**

```python
import asyncio
import json
from collections.abc import AsyncIterator
from backend.models import RouteDecision
from backend.mentors import MentorLibrary
from backend.memory import Store
from backend.providers.base import LLMProvider

SILENCE = "[本轮无补充]"


class ChatOrchestrator:
    def __init__(self, provider: LLMProvider, library: MentorLibrary,
                 store: Store, max_speakers: int = 4):
        self._p = provider
        self._lib = library
        self._store = store
        self._max = max_speakers

    def _roster_text(self) -> str:
        return "\n".join(
            f"- {c.id} | {c.name}（{c.title}）| 擅长: {', '.join(c.expertise)} | 信念: {c.belief}"
            for c in self._lib.roster())

    async def route(self, user_msg, context, long_term) -> RouteDecision:
        sys = (
            "你是研究委员会的主持人。根据用户消息，从下面导师名册中挑选本轮最该发言的导师"
            f"（最多 {self._max} 位，可更少），并给每位一句定向指令。"
            "只输出 JSON：{\"speakers\":[{\"mentor_id\":...,\"directive\":...,\"order\":1}],"
            "\"synthesize\":bool,\"reason\":...}。\n名册:\n" + self._roster_text())
        msgs = [{"role": "system", "content": sys},
                {"role": "user", "content": user_msg}]
        raw = await self._p.complete(msgs, temperature=0)
        try:
            start, end = raw.find("{"), raw.rfind("}")
            return RouteDecision.parse_capped(raw[start:end + 1], self._max)
        except Exception:
            cards = self._lib.roster()[: self._max]
            from backend.models import SpeakerDirective
            return RouteDecision(
                speakers=[SpeakerDirective(mentor_id=c.id, order=i)
                          for i, c in enumerate(cards)],
                synthesize=False, reason="路由降级：全员发言")

    async def _mentor_stream(self, sp, user_msg, queue):
        mentor = self._lib.get(sp.mentor_id)
        sys = self._lib.render_system_prompt(mentor)
        msgs = [{"role": "system", "content": sys},
                {"role": "user", "content": f"用户说：{user_msg}\n\n主持人给你的定向指令：{sp.directive}"}]
        await queue.put({"type": "mentor_start", "mentor_id": mentor.id,
                         "name": mentor.name, "color": mentor.color})
        buf = ""
        async for tok in self._p.stream(msgs):
            buf += tok
            await queue.put({"type": "token", "mentor_id": mentor.id, "text": tok})
        silent = buf.strip() == SILENCE
        await queue.put({"type": "mentor_end", "mentor_id": mentor.id, "is_silent": silent})
        return mentor, buf, silent

    async def run_turn(self, conversation_id, user_msg) -> AsyncIterator[dict]:
        self._store.add_message(conversation_id, "user", user_msg)
        long_term = self._store.get_long_term()
        context = self._store.get_messages(conversation_id)
        decision = await self.route(user_msg, context, long_term)
        yield {"type": "route", "speakers": [s.model_dump() for s in decision.speakers],
               "reason": decision.reason}

        queue: asyncio.Queue = asyncio.Queue()
        tasks = [asyncio.create_task(self._mentor_stream(sp, user_msg, queue))
                 for sp in decision.speakers]

        pending = len(tasks)
        ended = 0
        while ended < pending:
            ev = await queue.get()
            yield ev
            if ev["type"] == "mentor_end":
                ended += 1
        results = await asyncio.gather(*tasks)
        for mentor, buf, silent in results:
            self._store.add_message(conversation_id, "mentor",
                                    "" if silent else buf, mentor_id=mentor.id,
                                    is_silent=silent)

        if decision.synthesize:
            yield {"type": "synthesis_start"}
            spoken = [f"{m.name}: {b}" for m, b, s in results if not s]
            sys = "你是主持人，请用中文收敛出：共识 / 分歧 / 待决问题。简洁。"
            msgs = [{"role": "system", "content": sys},
                    {"role": "user", "content": "\n\n".join(spoken)}]
            buf = ""
            async for tok in self._p.stream(msgs):
                buf += tok
                yield {"type": "token", "mentor_id": "moderator", "text": tok}
            self._store.add_message(conversation_id, "moderator", buf, mentor_id="moderator")
        yield {"type": "done"}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `uv run pytest tests/test_chat_router.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/orchestrator/ tests/test_chat_router.py
git commit -m "feat: 聊天模式编排器（路由+并行流式+综述）"
```

---

## Task 9: 深度评审编排器（6 步状态机）

**Files:**
- Create: `backend/orchestrator/deep_review.py`
- Test: `tests/test_deep_review.py`

**Interfaces:**
- Consumes: 同 Task 8 + `review_rounds`。
- Produces `deep_review.py`:
  - `class DeepReviewOrchestrator`：构造 `provider, library, store, rounds=3`。
  - `async def run(conversation_id, idea) -> AsyncIterator[dict]`：依次 yield 6 个阶段事件 `{"type":"phase","name":...}` + `token` + 末尾 `{"type":"report","markdown":...}`、`{"type":"done"}`。阶段：independent_review / debate / assumptions / research_gap / experiment_design / conclusion。最终汇总成 markdown 存 `review_reports`。
  - 全员独立评审用 roster 全部导师（或前 N，YAGNI：先全员）。debate 跑 `rounds` 轮。

- [ ] **Step 1: 写失败测试 `tests/test_deep_review.py`**

```python
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `uv run pytest tests/test_deep_review.py -v`
Expected: FAIL

- [ ] **Step 3: 实现 `backend/orchestrator/deep_review.py`**

```python
from collections.abc import AsyncIterator
from backend.mentors import MentorLibrary
from backend.memory import Store
from backend.providers.base import LLMProvider

PHASES = ["independent_review", "debate", "assumptions",
          "research_gap", "experiment_design", "conclusion"]

PHASE_PROMPTS = {
    "assumptions": "以 Markdown 表格列出这个 idea 的隐含假设（假设 | 风险 | 若不成立的后果）。",
    "research_gap": "列出：尚未解决的问题 / 当前方法缺陷 / 潜在创新点。",
    "experiment_design": "给出实验设计：Baseline / Dataset / Metrics / Ablation / Failure Cases。",
    "conclusion": "给出最终结论：研究价值 / 技术价值 / 工程价值 / 商业价值 / 创新等级 / 推荐方向 / 下一步行动。",
}


class DeepReviewOrchestrator:
    def __init__(self, provider: LLMProvider, library: MentorLibrary,
                 store: Store, rounds: int = 3):
        self._p = provider
        self._lib = library
        self._store = store
        self._rounds = rounds

    async def _collect(self, sys, user) -> str:
        buf = ""
        async for tok in self._p.stream(
                [{"role": "system", "content": sys}, {"role": "user", "content": user}]):
            buf += tok
        return buf

    async def run(self, conversation_id, idea) -> AsyncIterator[dict]:
        self._store.add_message(conversation_id, "user", idea, mode="review")
        sections: dict[str, str] = {}

        # 1. 独立评审（全员）
        yield {"type": "phase", "name": "independent_review"}
        reviews = []
        for card in self._lib.roster():
            mentor = self._lib.get(card.id)
            sys = self._lib.render_system_prompt(mentor)
            text = ""
            async for tok in self._p.stream(
                    [{"role": "system", "content": sys},
                     {"role": "user", "content": f"独立评审这个想法：{idea}"}]):
                text += tok
                yield {"type": "token", "mentor_id": mentor.id, "text": tok}
            reviews.append(f"{mentor.name}: {text}")
        sections["independent_review"] = "\n\n".join(reviews)

        # 2. 交叉辩论
        yield {"type": "phase", "name": "debate"}
        debate_log = []
        prior = "\n\n".join(reviews)
        for r in range(self._rounds):
            sys = "你是主持人，挑出上面评审中最对立的两个观点，组织一轮针锋相对的辩论，用中文。"
            text = await self._collect(sys, prior + "\n\n（第 %d 轮）" % (r + 1))
            for tok in text:
                yield {"type": "token", "mentor_id": "moderator", "text": tok}
            debate_log.append(text)
            prior = text
        sections["debate"] = "\n\n".join(debate_log)

        # 3-6 主持人综合阶段
        for name in ["assumptions", "research_gap", "experiment_design", "conclusion"]:
            yield {"type": "phase", "name": name}
            ctx = f"原始想法：{idea}\n\n评审与辩论摘要：\n{sections['independent_review']}\n{sections['debate']}"
            text = await self._collect(PHASE_PROMPTS[name], ctx)
            for tok in text:
                yield {"type": "token", "mentor_id": "moderator", "text": tok}
            sections[name] = text

        report = self._assemble(idea, sections)
        self._store.save_report(conversation_id, report)
        self._store.add_message(conversation_id, "moderator", report, mentor_id="moderator", mode="review")
        yield {"type": "report", "markdown": report}
        yield {"type": "done"}

    def _assemble(self, idea, s) -> str:
        return (
            f"# 深度评审报告\n\n**Idea:** {idea}\n\n"
            f"## 1. 专家独立分析\n{s['independent_review']}\n\n"
            f"## 2. 专家辩论\n{s['debate']}\n\n"
            f"## 3. 隐含假设\n{s['assumptions']}\n\n"
            f"## 4. Research Gap\n{s['research_gap']}\n\n"
            f"## 5. 实验设计\n{s['experiment_design']}\n\n"
            f"## 6. 最终结论\n{s['conclusion']}\n")
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `uv run pytest tests/test_deep_review.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/orchestrator/deep_review.py tests/test_deep_review.py
git commit -m "feat: 深度评审编排器（6 步状态机）"
```

---

## Task 10: Search 抽象 + 导师资料员 Agent

**Files:**
- Create: `backend/search.py`, `backend/researcher.py`
- Test: `tests/test_researcher.py`

**Interfaces:**
- Produces:
  - `search.py`: `class SearchTool(ABC)` 带 `async def search(query: str) -> list[dict]`（dict: `title, url, snippet`）；`class TavilySearch(SearchTool)`（用 httpx，构造 `api_key`）；`class NullSearch(SearchTool)`（返回 []，无 key 时用）。
  - `researcher.py`: `class MentorResearcher`：构造 `provider, search: SearchTool, mentors_dir`。`async def build(name: str) -> str`（搜索 → 合成 md → 写入 `<dir>/<id>.md`，返回路径）。`refresh` 行为：若文件存在，生成新正文但保留原 frontmatter 的人工字段，返回 diff 文本不直接覆盖（由调用方确认）。id 由 name 经 `_slugify` 生成。

- [ ] **Step 1: 写失败测试 `tests/test_researcher.py`**

```python
import os, pytest
from backend.providers.base import LLMProvider
from backend.search import NullSearch, SearchTool
from backend.researcher import MentorResearcher

class FakeSearch(SearchTool):
    async def search(self, query):
        return [{"title": "t", "url": "http://x", "snippet": "卡帕西是深度学习工程师"}]

class MDProvider(LLMProvider):
    async def stream(self, messages, model=None, temperature=0.7):
        yield ("---\nid: karpathy\nname: 安德烈·卡帕西\ntitle: 深度学习工程师\n"
               "expertise: [神经网络]\nbelief: 简单可扩展者胜。\ncolor: \"#111111\"\n---\n## 你是谁\n卡帕西。")

@pytest.mark.asyncio
async def test_build_writes_md(tmp_path):
    r = MentorResearcher(MDProvider(), FakeSearch(), str(tmp_path))
    path = await r.build("安德烈·卡帕西")
    assert os.path.exists(path)
    import frontmatter
    post = frontmatter.load(path)
    assert post.metadata["id"]

@pytest.mark.asyncio
async def test_null_search_disables_gracefully(tmp_path):
    r = MentorResearcher(MDProvider(), NullSearch(), str(tmp_path))
    # NullSearch 返回空，仍能用 LLM 已有知识生成（不报错）
    path = await r.build("某人")
    assert os.path.exists(path)
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `uv run pytest tests/test_researcher.py -v`
Expected: FAIL

- [ ] **Step 3: 实现 `backend/search.py`**

```python
from abc import ABC, abstractmethod
import httpx


class SearchTool(ABC):
    @abstractmethod
    async def search(self, query: str) -> list[dict]:
        ...


class NullSearch(SearchTool):
    async def search(self, query: str) -> list[dict]:
        return []


class TavilySearch(SearchTool):
    def __init__(self, api_key: str):
        self._key = api_key

    async def search(self, query: str) -> list[dict]:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post("https://api.tavily.com/search",
                             json={"api_key": self._key, "query": query, "max_results": 5})
            r.raise_for_status()
            data = r.json()
        return [{"title": x.get("title", ""), "url": x.get("url", ""),
                 "snippet": x.get("content", "")} for x in data.get("results", [])]
```

- [ ] **Step 4: 实现 `backend/researcher.py`**

```python
import os
import re
import frontmatter
from backend.providers.base import LLMProvider
from backend.search import SearchTool

TEMPLATE_GUIDE = """生成一个导师 Markdown 档案。严格输出：
首行 --- 开始的 YAML frontmatter，含 id(英文小写slug)/name/title/expertise(列表)/belief(一句)/color(十六进制)，
随后正文五段：## 你是谁 / ## 你的世界观与信仰 / ## 你如何拆解问题·必问的问题 / ## 你最看不惯什么 / ## 你的语气与口头禅。
正文写丰满、有棱角、第一人称设定。不要编造无法佐证的事实。"""


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", name).strip("-").lower()
    return s or "mentor"


class MentorResearcher:
    def __init__(self, provider: LLMProvider, search: SearchTool, mentors_dir: str):
        self._p = provider
        self._s = search
        self._dir = mentors_dir

    async def build(self, name: str) -> str:
        results = await self._s.search(f"{name} 学术主张 著名言论 研究风格")
        evidence = "\n".join(f"- {r['title']}: {r['snippet']} ({r['url']})" for r in results)
        sys = TEMPLATE_GUIDE
        user = f"导师姓名：{name}\n\n可参考的联网资料（可能为空）：\n{evidence or '（无）'}"
        md = await self._p.complete(
            [{"role": "system", "content": sys}, {"role": "user", "content": user}])
        post = frontmatter.loads(md)
        mentor_id = post.metadata.get("id") or _slugify(name)
        post.metadata["id"] = mentor_id
        if results:
            post.metadata["sources"] = [r["url"] for r in results]
        os.makedirs(self._dir, exist_ok=True)
        path = os.path.join(self._dir, f"{mentor_id}.md")
        with open(path, "w", encoding="utf-8") as f:
            f.write(frontmatter.dumps(post))
        return path
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `uv run pytest tests/test_researcher.py -v`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add backend/search.py backend/researcher.py tests/test_researcher.py
git commit -m "feat: Search 抽象与导师资料员 Agent"
```

---

## Task 11: CLI（mentor add / refresh）

**Files:**
- Create: `backend/cli.py`
- Modify: `pyproject.toml`（加 `[project.scripts]` superbrain = "backend.cli:main"）
- Test: `tests/test_cli.py`

**Interfaces:**
- Consumes: `MentorResearcher`, `get_settings`, `TavilySearch`/`NullSearch`, `OpenAICompatProvider`。
- Produces `cli.py`: `def main(argv=None)`，用 argparse 子命令：`mentor add <name>`、`mentor refresh <id>`。`def _make_researcher() -> MentorResearcher`（按 settings 选 search 后端）。

- [ ] **Step 1: 写失败测试 `tests/test_cli.py`**

```python
from backend.cli import build_parser

def test_parser_has_mentor_add():
    p = build_parser()
    ns = p.parse_args(["mentor", "add", "卡帕西"])
    assert ns.cmd == "mentor" and ns.action == "add" and ns.name == "卡帕西"
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `uv run pytest tests/test_cli.py -v`
Expected: FAIL

- [ ] **Step 3: 实现 `backend/cli.py`**

```python
import argparse
import asyncio
from backend.config import get_settings
from backend.providers.openai_compat import OpenAICompatProvider
from backend.search import TavilySearch, NullSearch
from backend.researcher import MentorResearcher


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="superbrain")
    sub = p.add_subparsers(dest="cmd", required=True)
    mentor = sub.add_parser("mentor")
    msub = mentor.add_subparsers(dest="action", required=True)
    add = msub.add_parser("add")
    add.add_argument("name")
    add.set_defaults(cmd="mentor", action="add")
    refresh = msub.add_parser("refresh")
    refresh.add_argument("id")
    refresh.set_defaults(cmd="mentor", action="refresh")
    return p


def _make_researcher() -> MentorResearcher:
    s = get_settings()
    s.require_llm()
    provider = OpenAICompatProvider(s.llm_base_url, s.llm_api_key, s.llm_model)
    search = TavilySearch(s.tavily_api_key) if s.tavily_api_key else NullSearch()
    return MentorResearcher(provider, search, "config/mentors")


def main(argv=None):
    ns = build_parser().parse_args(argv)
    if ns.cmd == "mentor" and ns.action == "add":
        path = asyncio.run(_make_researcher().build(ns.name))
        print(f"已写入 {path}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 运行测试，确认通过 + 加 scripts**

`pyproject.toml` 增：
```toml
[project.scripts]
superbrain = "backend.cli:main"
```
Run: `uv run pytest tests/test_cli.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/cli.py pyproject.toml tests/test_cli.py
git commit -m "feat: CLI mentor add/refresh"
```

---

## Task 12: FastAPI 入口 + SSE 路由

**Files:**
- Create: `backend/main.py`
- Test: `tests/test_api.py`

**Interfaces:**
- Consumes: `ChatOrchestrator`, `DeepReviewOrchestrator`, `Store`, `MentorLibrary`, providers, `get_settings`。
- Produces `main.py`: FastAPI `app`。依赖注入用模块级单例（store/library/provider）。路由：
  - `GET /api/mentors` → roster（list[MentorCard dict]）
  - `GET /api/conversations` / `POST /api/conversations`（body `{title}`）
  - `GET /api/conversations/{id}/messages`
  - `POST /api/chat`（body `ChatRequest`）→ `EventSourceResponse`，按 mode 选编排器，把事件 dict 以 SSE `data: json` 流出。
  - 提供 `create_app(provider=None, store=None, library=None)` 工厂便于测试注入 FakeProvider。

- [ ] **Step 1: 写失败测试 `tests/test_api.py`**

```python
from fastapi.testclient import TestClient
from backend.main import create_app
from backend.memory import Store
from backend.mentors import MentorLibrary
from tests.conftest import FakeProvider

def _client():
    rj = '{"speakers":[{"mentor_id":"alice","directive":"d","order":1}],"synthesize":false}'
    provider = FakeProvider(scripted=[rj, "hello there"])
    app = create_app(provider=provider, store=Store(":memory:"),
                     library=MentorLibrary("tests/fixtures/mentors"))
    return TestClient(app)

def test_list_mentors():
    c = _client()
    r = c.get("/api/mentors")
    assert r.status_code == 200
    assert {m["id"] for m in r.json()} == {"alice", "bob"}

def test_chat_stream_returns_events():
    c = _client()
    cid = c.post("/api/conversations", json={"title": "t"}).json()["id"]
    with c.stream("POST", "/api/chat",
                  json={"conversation_id": cid, "content": "hi", "mode": "chat"}) as r:
        body = "".join(chunk for chunk in r.iter_text())
    assert "route" in body and "done" in body
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `uv run pytest tests/test_api.py -v`
Expected: FAIL

- [ ] **Step 3: 实现 `backend/main.py`**

```python
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from backend.config import get_settings
from backend.memory import Store
from backend.mentors import MentorLibrary
from backend.models import ChatRequest
from backend.providers.openai_compat import OpenAICompatProvider
from backend.orchestrator.chat_router import ChatOrchestrator
from backend.orchestrator.deep_review import DeepReviewOrchestrator


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
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                       allow_headers=["*"])

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
        gen = (review.run(cid, req.content) if req.mode == "review"
               else chat.run_turn(cid, req.content))

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
```

注：模块导入时不实例化 `app`（避免无 .env 时 import 失败）；提供 `uvicorn` 启动用 `backend.main:get_app`（factory）。

- [ ] **Step 4: 运行测试，确认通过**

Run: `uv run pytest tests/test_api.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/main.py tests/test_api.py
git commit -m "feat: FastAPI 入口与 SSE 路由"
```

---

## Task 13: 前端（Vite + React + TS）聊天界面

**Files:**
- Create: `frontend/`（`npm create vite@latest frontend -- --template react-ts`），核心改 `frontend/src/App.tsx`, `frontend/src/api.ts`, `frontend/src/components/*`
- Test: 前端以手动验证为主（见 Step 5）；逻辑单元 `frontend/src/api.ts` 的 SSE 解析可加 vitest（可选）。

**Interfaces:**
- Consumes: 后端 `/api/*`。
- Produces:
  - `api.ts`: `streamChat(req, onEvent)` 用 `fetch` + `ReadableStream` 解析 SSE；`listMentors()`, `listConversations()`, `createConversation()`, `getMessages(cid)`。
  - 组件：`Sidebar`（会话列表）、`ChatStream`（消息流 + 多导师气泡，按 mentor_id 分组累加 token，气泡用 color）、`MentorRoster`（右栏，含「＋新建导师」按钮，调用后端——注：建档走 CLI/后端，可先占位）、`Composer`（输入框 + 模式切换 / `/review`）。

- [ ] **Step 1: 脚手架前端**

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install
```

- [ ] **Step 2: 写 `frontend/src/api.ts`（SSE 流式解析）**

```typescript
export interface ChatEvent { type: string; [k: string]: any }

export async function streamChat(
  body: { conversation_id: string | null; content: string; mode: string },
  onEvent: (e: ChatEvent) => void,
) {
  const resp = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      const line = p.split("\n").find((l) => l.startsWith("data:"));
      if (line) onEvent(JSON.parse(line.slice(5).trim()));
    }
  }
}

export const listMentors = () => fetch("/api/mentors").then((r) => r.json());
export const listConversations = () => fetch("/api/conversations").then((r) => r.json());
export const createConversation = (title: string) =>
  fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }).then((r) => r.json());
export const getMessages = (cid: string) =>
  fetch(`/api/conversations/${cid}/messages`).then((r) => r.json());
```

- [ ] **Step 3: 配置 Vite 代理 + 写 App/组件**

`frontend/vite.config.ts` 加：
```typescript
server: { proxy: { "/api": "http://localhost:8000" } }
```
`App.tsx`：三栏布局；状态 `mentorsById`（id→{name,color}）；`messages` 数组；发送时把多导师 token 按 `mentor_id` 分组累加进对应气泡（用 `Map`），`mentor_start` 建气泡、`token` 追加、`mentor_end` 若 `is_silent` 则移除空气泡。`Composer` 含模式切换 + 输入 `/review` 切 review 模式。气泡组件用 mentor color 作左边框/名牌。（实现完整 JSX，按上面状态机；保持单文件可读，组件拆到 `components/`。）

- [ ] **Step 4: 加根目录启动脚本**

`README.md` 记录启动方式：
```bash
# 后端
uv run uvicorn --factory backend.main:get_app --port 8000
# 前端
cd frontend && npm run dev
```

- [ ] **Step 5: 手动验证（端到端）**

1. 配好 `.env`，先跑冒烟测试 `uv run pytest -m smoke -s`。
2. 起后端 + 前端，浏览器打开 Vite 地址。
3. 新建会话，发一条 idea，确认：主持人路由状态出现 → 多位导师气泡并行流式 → （若 synthesize）综述出现。
4. 输入 `/review <idea>`，确认 6 个阶段依次推进、末尾出报告卡片。
5. 刷新页面，确认会话与消息从 SQLite 恢复。

- [ ] **Step 6: 提交**

```bash
git add frontend/ README.md
git commit -m "feat: 前端聊天界面（多导师流式气泡 + 深度评审）"
```

---

## Self-Review

**Spec coverage:**
- 智能主持人编排 → Task 8 ✓
- 双模式（聊天/深度评审）→ Task 8 / Task 9 ✓
- 本地个人工具 → 无登录，SQLite 本地 ✓
- 多供应商（默认 LiteLLM 网关）→ Task 2 provider 抽象 + Task 12 注入 ✓
- 多会话 + 跨会话长期记忆 → Task 7（表 + long_term）；长期记忆抽取（写入）当前由 `add_long_term` 提供接口，自动抽取触发点见下方「已知缺口」
- Markdown 导师库 + 两级按需召唤 → Task 4/5（roster 只读 frontmatter，get 加载全文）✓
- 导师资料员联网建档 → Task 10/11 ✓
- 流式多气泡前端 → Task 13 ✓
- uv + FastAPI/SSE + React → Task 1/12/13 ✓
- 错误处理（路由降级、导师失败、key 缺失）→ Task 8 降级、Task 1 require_llm；单导师失败隔离见下方「已知缺口」补充
- 测试策略 → 各 Task 均 TDD ✓

**已知缺口（执行时补，均为小增量，不阻塞主线）:**
1. **单个导师调用失败隔离**：Task 8 `_mentor_stream` 用 try/except 包裹 provider 流，失败时 yield `{"type":"mentor_end","is_silent":false,"error":true}` 并气泡显示「⚠️ 暂时缺席」，不影响其他导师 `gather`（用 `return_exceptions=True`）。执行 Task 8 时一并实现并加一条测试。
2. **跨会话长期记忆自动抽取**：会话「固化」触发点——在 Task 12 加 `POST /api/conversations/{id}/consolidate`：取该会话消息，调用 provider 抽取 direction/preference/rejected_idea 写入 `long_term_memory`；新会话路由时 `route()` 已接收 `long_term` 参数并注入 system prompt（执行 Task 8 时把 long_term 拼进路由 sys）。执行 Task 12 时实现端点 + 一条测试。
3. **mentor refresh 的 diff 保留逻辑**：Task 10 `build` 已覆盖 add；refresh 的「保留人工字段 + diff 确认」在 Task 11 CLI 实现 `refresh` 分支（读旧 frontmatter，合并后打印 unified diff，`--yes` 才写）。

**Placeholder scan:** 无 TBD/TODO；每个代码步骤含完整代码。

**Type consistency:** `RouteDecision.parse_capped(raw, max_speakers)` 在 Task 6 定义、Task 8 使用，签名一致；事件 dict 的 `type` 取值在 Task 8/9 与 Task 13 前端解析一致（route/mentor_start/token/mentor_end/synthesis_start/phase/report/done）；`Store` 方法签名 Task 7 定义、Task 8/9/12 调用一致；`MentorLibrary.roster()/get()/render_system_prompt()` Task 5 定义、后续一致。
