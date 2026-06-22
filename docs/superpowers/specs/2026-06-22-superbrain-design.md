# SuperBrain —— AI × 无人机 × 具身智能研究委员会

> 设计文档 · 2026-06-22

## 1. 目标与定位

构建一个本地运行的 multi-agent 头脑风暴系统。由一组世界级专家（导师 agent）组成「研究委员会」，**目标不是认同用户，而是发现问题、挑战假设、提出风险、挖掘机会、找突破口**，帮助用户在迷茫中形成顶级研究方向。

- 形态：类 ChatGPT 的网页端，单一聊天窗口，多位导师可在同一轮各自输出气泡，也可选择沉默。
- 编排：由一个隐藏的「主持人 agent」智能决定本轮邀请哪些导师、顺序、是否互相辩论、是否综述。
- 范围：**本地个人工具**（单用户，跑在本机），不做登录/多租户/云部署。架构尽量解耦，未来上云时改动可控。

### 非目标（YAGNI）

- 不做用户系统、权限、计费、多租户。
- 不做移动端原生 App。
- 不做语音/视频交互（首版纯文本 + Markdown）。

## 2. 核心决策（已与用户对齐）

| 维度 | 决策 |
| --- | --- |
| 编排模型 | 智能主持人编排（路由 → 导师发言 → 可选综述） |
| 部署 | 本地个人工具 |
| 模型供应商 | LiteLLM 网关（OpenAI 兼容），默认模型 `gemini-3.5-flash`；抽象层保留可切其它供应商 |
| 记忆 | 多会话 + 跨会话长期记忆 |
| 导师库 | 一人一个 Markdown 文件，可无限扩展；两级按需召唤 |
| 导师建档 | 导师资料员 Agent 自动联网搜索生成/更新人设 |
| 工作模式 | 双模式：💬 聊天模式（默认） + 🔬 深度评审模式（6 步流水线） |
| 技术栈 | Python（FastAPI + SSE）+ 轻量 React（Vite）+ SQLite；环境用 uv |

## 3. 架构总览

```
┌─────────────────────────────────────────────────┐
│  浏览器前端 (React + Vite)                          │
│  ChatGPT 式聊天 · 多导师气泡并行流式 · 会话侧栏 · 导师名册 │
└───────────────┬─────────────────────────────────┘
                │ HTTP + SSE (EventStream)
┌───────────────▼─────────────────────────────────┐
│  FastAPI 后端                                      │
│  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Orchestrator │  │ LLM Provider 抽象层         │  │
│  │ ·聊天模式路由   │──│ Claude / OpenAI / 公司网关   │  │
│  │ ·深度评审流水线 │  └──────────────────────────┘  │
│  └──────┬───────┘  ┌──────────────────────────┐  │
│         │          │ Search 工具抽象 (web_search) │  │
│  ┌──────▼───────┐  └──────────────────────────┘  │
│  │ 导师库 + 召唤   │  ┌──────────────────────────┐  │
│  │ (mentors/*.md)│  │ 导师资料员 Agent             │  │
│  └──────────────┘  └──────────────────────────┘  │
│  ┌──────────────────────────────────────────┐    │
│  │ 记忆/持久化 (SQLite): 会话·消息·报告·长期记忆   │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### 组件职责（单一职责、清晰接口）

- **LLM Provider 抽象层**：输入 messages + 选项，输出流式 token。默认实现为 **OpenAI 兼容客户端指向 LiteLLM 网关**（`base_url` / `api_key` / `model` 从环境变量读）；接口设计保留切换到 Claude 原生等其它后端的空间。
- **Search 工具抽象**：输入查询，输出带来源链接的结果。默认用供应商自带 web 搜索，回落到可配置搜索 API。
- **导师库 + 召唤**：扫描 `config/mentors/*.md`；提供「轻量名册索引」与「按 id 取完整人设正文」两个接口。
- **Orchestrator**：编排两种模式。只决定「谁说、按什么流程说」，不关心模型细节。
- **导师资料员 Agent**：联网搜索 → 合成 → 写/更新 mentor md。
- **记忆/持久化层**：SQLite 读写 + 长期记忆抽取。

## 4. 导师库:一人一个 Markdown，两级按需召唤

### 4.1 文件格式

`config/mentors/<id>.md`，Frontmatter（机器读）+ 正文（丰富人格）：

```markdown
---
id: mccarthy
name: 约翰·麦卡锡
title: 理论科学家 · 人工智能之父
expertise: [形式化, 问题定义, 逻辑推理, 理论AI]
belief: 无法被形式化的问题无法被解决。
model: gemini-3.5-flash     # 可选，逐人覆盖默认模型（须为网关支持的模型名）
color: "#4F46E5"            # 前端气泡主题色
sources:                    # 可选，资料员写入的引用链接
  - https://...
---

## 你是谁
（生平、立场、为什么有资格 challenge）

## 你的世界观与信仰
（展开成段，有棱角）

## 你如何拆解一个问题 / 你必问的问题
…

## 你最看不惯什么 / 你会激烈反对什么
…

## 你的语气、口头禅、经典句式
…
```

### 4.2 默认 7 人（来自 draft.md）

mccarthy（麦卡锡·理论/形式化）、hinton（辛顿·深度学习/表示）、feifei（李飞飞·感知与世界模型）、brooks（布鲁克斯·具身智能/反主流）、abbeel（阿贝尔·机器人学习/务实）、karem（卡雷姆·无人机/工程可靠性）、huang（黄仁勋·系统与产业/战略）。

### 4.3 两级加载（与主持人编排咬合）

1. **轻量名册索引**：启动时只解析所有 md 的 frontmatter，得到「导师名片」清单（id/姓名/头衔/expertise/一句 belief）。主持人 agent **只看这份清单**做路由，因此导师库可扩到数十人而不撑爆路由 prompt。
2. **按需加载全文**：仅被主持人选中的导师，才把其 md 完整正文注入为 system prompt。未选中者全文不进上下文。

### 4.4 全局「批判性宪法」

所有导师 system prompt 统一注入的硬规则（来自 draft 的「规则」段）：不为礼貌降低批判性、不轻易认可、不只给优点、必须主动找失败原因、必须提出更好的替代方案。

## 5. 编排引擎

### 5.1 💬 聊天模式（默认，每条用户消息）

1. **路由调用**（主持人 agent）：输入 = 用户消息 + 会话上下文 + 长期记忆 + 名册索引；输出结构化 JSON：

   ```json
   {
     "speakers": [
       {"mentor_id": "brooks", "directive": "质疑他对仿真依赖的假设", "order": 1},
       {"mentor_id": "karem", "directive": "从现实失效角度施压", "order": 2}
     ],
     "synthesize": true,
     "reason": "话题偏具身落地与可靠性"
   }
   ```

2. **导师并行发言**：每位选中的导师带完整人设 + 定向指令 + 上下文，**并行流式**输出到各自气泡。导师可输出哨兵 `[本轮无补充]` 表示沉默（前端不渲染空气泡，落库标记 silent）。
3. **可选主持人综述**：`synthesize=true` 时收敛「共识 / 分歧 / 待决问题」。

### 5.2 🔬 深度评审模式（`/review` 或按钮触发）

对当前 idea 跑 draft 的 6 步流水线，状态机驱动、每步可流式、可中断：

1. **独立评审**：全员（或主持人挑的子集）并行独立评审。
2. **交叉辩论**：N 轮（默认 3）。主持人每轮挑选对立观点对撞，导师看到他人观点后反驳/补充。
3. **隐含假设**：以表格列出 idea 的隐含假设。
4. **Research Gap**：尚未解决的问题 / 当前方法缺陷 / 潜在创新点。
5. **实验设计**：Baseline / Dataset / Metrics / Ablation / Failure Cases。
6. **最终结论**：研究价值 / 技术价值 / 工程价值 / 商业价值 / 创新等级 / 推荐方向 / 下一步行动。

产出一份 Markdown **评审报告**存入会话（`review_reports`），前端以可折叠卡片呈现、可导出。

## 6. 导师资料员 Agent

让导师库自我生长。

- **触发**：
  - CLI：`uv run superbrain mentor add "安德烈·卡帕西"` / `mentor refresh karpathy`
  - 前端：导师名册「＋ 新建导师」「🔄 更新资料」按钮。
- **工作流**（带搜索工具的 agent 循环）：
  1. 多角度联网搜索：生平履历、核心主张、著名言论金句、公开争论立场、典型批评风格。
  2. 抓取并交叉核对来源，保留引用链接，避免编造。
  3. 按 §4.1 模板合成 md，重点写丰满世界观/必问问题/最看不惯什么/口头禅，并填好 frontmatter 的 expertise/belief/sources。
  4. 写入 `config/mentors/<id>.md`。`refresh` 时保留人工改动，以 diff 形式让用户确认后再覆盖。
- **搜索后端（可插拔）**：因默认走 LiteLLM 网关（`gemini-3.5-flash`），是否暴露原生 web 搜索工具不确定，故**默认用可配置搜索 API（Tavily，填 `TAVILY_API_KEY` 即用）**；若实测网关/模型支持工具式联网搜索，可切换为原生。未配置任何搜索后端时，资料员功能优雅禁用并提示。

## 7. 记忆与持久化（SQLite）

表：

- `conversations(id, title, created_at, updated_at)`
- `messages(id, conversation_id, role, mentor_id, mode, content, is_silent, created_at)` — role ∈ {user, mentor, moderator}
- `review_reports(id, conversation_id, markdown, created_at)`
- `long_term_memory(id, kind, content, created_at)` — kind ∈ {direction, preference, rejected_idea}

**跨会话长期记忆**：会话结束或手动「固化」时，主持人 agent 抽取「长期研究方向 / 反复出现的偏好 / 已被否决的思路」写入 `long_term_memory`；新会话开场自动注入，使委员会记得用户是谁、在追什么。

## 8. 前端 UX

- 三栏：左会话列表、中聊天流、右导师名册（含建档按钮）。
- **多气泡并行流式**：一条用户消息后多位导师气泡同时出现，各带头像/姓名/主题色，token 逐字流入。主持人路由以一行轻量状态展示（「主持人邀请 辛顿、布鲁克斯 发言…」）。
- 顶部模式切换；`/review` 或按钮触发深度评审，报告以可折叠卡片呈现，可导出 Markdown。

## 9. 项目结构

```
superbrain/
├─ pyproject.toml              # uv 管理依赖
├─ README.md
├─ config/
│  └─ mentors/                 # 一人一个 md
│     ├─ mccarthy.md ... huang.md
├─ backend/
│  ├─ main.py                  # FastAPI 入口 + SSE 路由
│  ├─ models.py                # Pydantic schema
│  ├─ mentors.py               # 加载 md / 名册索引 / 取全文
│  ├─ orchestrator/
│  │  ├─ chat_router.py        # 聊天模式路由 + 发言
│  │  └─ deep_review.py        # 6 步评审状态机
│  ├─ providers/
│  │  ├─ base.py               # Provider 抽象接口
│  │  ├─ openai_compat.py      # 默认：OpenAI 兼容客户端 → LiteLLM 网关
│  ├─ search.py                # Search 工具抽象
│  ├─ researcher.py            # 导师资料员 Agent
│  ├─ memory.py                # SQLite 存取 + 长期记忆抽取
│  └─ cli.py                   # mentor add/refresh 等命令
├─ frontend/                   # Vite + React
└─ docs/superpowers/specs/
```

环境：`uv init`；`uv add fastapi uvicorn openai pydantic pyyaml sse-starlette python-frontmatter httpx python-dotenv`。前端 `npm create vite`。

### 9.1 运行配置（`.env`，已 gitignore）

```
LLM_BASE_URL=https://litellm.avantrobotics.ai/v1   # LiteLLM 网关，OpenAI 兼容
LLM_API_KEY=<secret>
LLM_MODEL=gemini-3.5-flash
TAVILY_API_KEY=                                    # 可选，资料员联网搜索回落
```

仓库提供 `.env.example`（不含密钥）。后端启动时用 `python-dotenv` 加载；缺关键变量时给出明确报错。Provider 默认用 `openai` SDK 指向 `LLM_BASE_URL`。

## 10. 错误处理

- **单个导师调用失败**：该气泡显示「⚠️ 暂时缺席」，不阻塞其他导师。
- **路由失败/JSON 解析失败**：降级为「全员发言」（或预设子集），并记录告警。
- **流式中断**：SSE 断线前端自动重连；后端已生成 token 落库可续读。
- **资料员搜索失败/无结果**：不写空档案，提示用户并保留旧文件。
- **provider key 缺失**：启动时校验并给出明确报错与配置指引。

## 11. 测试策略

- **Provider 抽象层**：mock provider 单测，验证流式接口契约。
- **导师库**：md 加载与 frontmatter 校验（必填字段、id 唯一、color 格式）；名册索引不加载正文。
- **编排器**：用录制的固定响应测路由 JSON 解析、沉默哨兵处理、深度评审状态机各步推进与中断。
- **记忆层**：会话/消息 CRUD、长期记忆抽取与注入。
- **资料员**：mock 搜索结果，验证生成 md 通过 frontmatter 校验；refresh 的 diff/保留逻辑。

## 12. 里程碑（供实现计划参考）

1. 脚手架（uv）+ Provider 抽象（OpenAI 兼容 → LiteLLM 网关，默认 `gemini-3.5-flash`）+ 导师库加载 + 名册索引。
2. 聊天模式编排（路由 → 并行流式发言 → 综述）+ SSE。
3. 前端聊天界面（多气泡流式 + 会话侧栏）。
4. 持久化 + 跨会话长期记忆。
5. 深度评审模式（6 步流水线 + 报告卡片）。
6. Search 抽象 + 导师资料员 Agent（CLI + 前端按钮）。
7. 错误处理打磨 + 测试补齐 + （可选）逐导师模型覆盖与备用 provider。
