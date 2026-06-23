# 🧠 SuperBrain

[![English README](https://img.shields.io/badge/README-English-blue)](./README.md)

**SuperBrain 是一个把模糊想法推进成 case-backed judgment 的 AI 研究委员会。**

它本地优先、多 Agent 协作，面向 AI 头脑风暴、批判分析和深度评审。  
它不是通用聊天机器人，而是帮助你抓住真正重要的问题，并把它想清楚。

## ✨ 它能做什么

- 组建一组专家导师
- 由主持人把合适的声音送进合适的讨论
- 围绕一个高价值 case 继续打穿
- 自动浮出最值得展开的代表性 case
- 一键围绕 case 深挖、对比或转成实验问题
- 从任意消息或报告 fork 出新的研究分支
- 跑结构化的深度评审流程
- 在本地保存会话、记忆和报告
- 导出 Markdown 或 PDF

## 🎯 为什么存在

大多数聊天机器人优化的是“快速回答”。  
SuperBrain 优化的是“把问题想清楚”。

核心循环是：

1. 判断用户当前思考阶段
2. 选择最小但最有用的专家组合
3. 把讨论锚定在代表性 case 上
4. 扩散高信号观点
5. 收束低信号观点
6. 推进到清晰判断

> **High signal expands, low signal collapses.**  
> **高信号扩散，低信号收束。**

## 🚀 核心优势

- **Case-backed judgment**：系统不是堆泛泛建议，而是把讨论推进到一个能支撑判断的关键 case。
- **信号路由**：有价值的观点会被扩散，无价值的观点会被收束，噪音不会主导讨论。
- **Case Spotlight**：主聊天区会浮出代表性 case，并提供深挖、对比、转实验三个后续动作。
- **可 fork 的研究分支**：可以从任意消息或报告开一条新分支，探索另一条路径，同时保留主线。
- **阶段感知编排**：系统会根据 `explore`、`clarify`、`decide`、`plan` 调整输出方式。
- **多专家批判**：导师可以互相质疑、挑战假设，也可以在没价值时保持沉默。
- **深度评审流程**：独立评审、交叉辩论、隐含假设、Research Gap、实验设计、最终结论。
- **长期记忆**：重要偏好、研究方向和被否定的思路可以跨会话保留。
- **本地优先存储**：会话、消息、报告和记忆都保存在你自己的 SQLite 里。
- **可扩展导师库**：每个导师都是一个 Markdown 文件，便于维护和扩展。
- **过程可视化**：路由、进度、活跃导师、评审阶段和洞察提炼都能看见。

## 🧩 它和其他工具的不同

SuperBrain 不是在拼“更多 token”或“更多答案”。  
它拼的是 **更好的思考结构**。

和普通 chatbot 比，它给你的不是堆回答，而是：

- 更清晰的问题框架
- 围绕代表性 case 的更尖锐讨论
- 更高的信噪比
- 可追溯的判断形成过程
- 可以分叉探索的研究路径

和通用 Agent 框架比，它给你的不是积木，而是：

- 明确的研究工作流
- 经过筛选的导师面板
- 随阶段变化的行为
- 可直接使用的产品形态

## 🛠 产品形态

- **前端**：React + Vite 聊天界面，支持多导师流式输出、侧边栏和评审结果展示。
- **后端**：FastAPI + SSE 编排层。
- **模型接入**：通过 LiteLLM 网关使用 OpenAI-compatible client。
- **持久化**：SQLite 保存会话、消息、报告和记忆。
- **导师**：每个导师一个 Markdown 文件，存放在 `config/mentors/`。
- **分支**：支持可 fork 的会话路径，并维护分支级状态和上下文。

## ⚡ 快速开始

### 环境要求

- macOS 或 Linux shell
- Python 3.11+
- [`uv`](https://docs.astral.sh/uv/)
- Node.js + npm

### 后端

```bash
uv sync
cp .env.example .env
```

在 `.env` 中填写：

```bash
PORT=8000
LLM_BASE_URL=...
LLM_API_KEY=...
LLM_MODEL=gemini-3.5-flash
```

可选：

```bash
TAVILY_API_KEY=...
```

启动后端：

```bash
uv run python -m backend.main
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

然后打开 Vite 地址，一般是：

```text
http://localhost:5173
```

## 🧭 常用方式

### 聊天模式

用于开放式头脑风暴。主持人会自动判断阶段并路由导师。

### 评审模式

使用 `/review <idea>` 或切换到评审模式，跑完整结构化评审流程。

### 添加导师

导师存放在 `config/mentors/`，每个导师一个 Markdown 文件。

```bash
uv run superbrain add-mentor <url>
```

## 📝 导师文件格式

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

Markdown 正文会成为导师完整的人设 prompt。

## ✅ 测试

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

## 📦 项目结构

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

## 🤝 贡献方向

最值得做的方向通常是：

- 更强的路由与阶段判断
- 更好的导师 prompt 和导师选择
- 更尖锐的 case 讨论方式
- 更有用的记忆抽取
- 更高质量的评审报告

## 📌 状态

项目仍在持续演进。  
随着研究工作流继续变清晰，产品形态也会持续调整。
