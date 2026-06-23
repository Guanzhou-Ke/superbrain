from backend.context_manager import ConversationContextManager


def test_context_manager_formats_recent_transcript():
    manager = ConversationContextManager(max_tokens=200)
    context = manager.build(
        [
            {"role": "user", "content": "我想做多智能体强化学习"},
            {"role": "mentor", "mentor_id": "alice", "content": "先明确任务分解"},
            {"role": "moderator", "content": "先收敛问题定义"},
        ],
        mentor_names={"alice": "Alice"},
    )

    assert context.total_messages == 3
    assert context.kept_messages == 3
    assert "- user: 我想做多智能体强化学习" in context.transcript
    assert "- Alice: 先明确任务分解" in context.transcript
    assert "- moderator: 先收敛问题定义" in context.transcript


def test_context_manager_trims_old_messages_by_token_budget():
    manager = ConversationContextManager(max_tokens=40)
    messages = []
    for i in range(6):
        messages.append({"role": "user", "content": f"第{i}轮用户问题，包含一些额外上下文描述"})
        messages.append({"role": "mentor", "mentor_id": "alice", "content": f"第{i}轮导师回答，包含一些额外分析内容"})

    context = manager.build(messages, mentor_names={"alice": "Alice"})

    assert context.kept_messages < context.total_messages
    assert "第0轮用户问题" not in context.transcript
    assert "第5轮用户问题" in context.transcript
