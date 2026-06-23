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


def test_create_conversation_creates_root_branch():
    s = Store(":memory:")
    cid = s.create_conversation("test")
    branches = s.list_branches(cid)
    assert len(branches) == 1
    assert branches[0]["parent_branch_id"] is None


def test_create_branch_and_branch_messages_are_isolated():
    s = Store(":memory:")
    cid = s.create_conversation("test")
    root = s.ensure_branch_for_conversation(cid)
    s.add_message(cid, "user", "root only", branch_id=root)
    fork = s.create_branch(cid, root, None, "Fork 1")
    s.add_message(cid, "user", "fork only", branch_id=fork)

    root_messages = s.get_branch_messages(root)
    fork_messages = s.get_branch_messages(fork)

    assert [m["content"] for m in root_messages] == ["root only"]
    assert [m["content"] for m in fork_messages] == ["fork only"]


def test_get_branch_messages_until_returns_fork_prefix():
    s = Store(":memory:")
    cid = s.create_conversation("test")
    root = s.ensure_branch_for_conversation(cid)
    s.add_message(cid, "user", "before", branch_id=root)
    fork_point = s.add_message(cid, "mentor", "fork here", mentor_id="brooks", branch_id=root)
    s.add_message(cid, "user", "after", branch_id=root)

    prefix = s.get_branch_messages_until(root, fork_point)

    assert [m["content"] for m in prefix] == ["before", "fork here"]


def test_branch_state_roundtrip():
    s = Store(":memory:")
    cid = s.create_conversation("test")
    root = s.ensure_branch_for_conversation(cid)
    s.update_branch_state(
        root,
        intent_summary="讨论如何做研究",
        domain_scope="research-method",
        open_questions=["更偏学术界还是工业界"],
        resolved_constraints=["不要泛泛而谈"],
        current_stage="clarify",
        last_router_action="direct_answer",
    )
    state = s.get_branch_state(root)
    assert state["intent_summary"] == "讨论如何做研究"
    assert state["open_questions"] == ["更偏学术界还是工业界"]
    assert state["current_stage"] == "clarify"


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


def test_list_conversations():
    s = Store(":memory:")
    s.create_conversation("first")
    s.create_conversation("second")
    convs = s.list_conversations()
    assert len(convs) == 2
    titles = {c["title"] for c in convs}
    assert titles == {"first", "second"}


def test_update_conversation_title():
    s = Store(":memory:")
    cid = s.create_conversation("Conversation 2026")
    root = s.ensure_branch_for_conversation(cid)

    assert s.update_conversation_title(cid, "无人机强化学习安全约束") is True
    assert s.get_conversation(cid)["title"] == "无人机强化学习安全约束"
    assert s.get_branch(root)["title"] == "无人机强化学习安全约束"
    assert s.update_conversation_title("missing", "x") is False


def test_add_message_returns_id():
    s = Store(":memory:")
    cid = s.create_conversation("x")
    mid = s.add_message(cid, "user", "hello")
    assert mid
    assert isinstance(mid, str)
    assert len(mid) == 32  # uuid4().hex is 32 chars


def test_message_defaults():
    s = Store(":memory:")
    cid = s.create_conversation("d")
    s.add_message(cid, "user", "msg")
    msgs = s.get_messages(cid)
    assert msgs[0]["mode"] == "chat"
    assert msgs[0]["mentor_id"] is None
    assert msgs[0]["is_silent"] == 0


def test_delete_conversation_removes_related_rows():
    s = Store(":memory:")
    cid = s.create_conversation("delete me")
    other = s.create_conversation("keep me")
    s.add_message(cid, "user", "remove")
    s.save_report(cid, "# remove")
    s.add_message(other, "user", "keep")
    s.save_report(other, "# keep")

    assert s.delete_conversation(cid) is True

    assert s.get_conversation(cid) is None
    assert s.get_messages(cid) == []
    assert s.get_reports(cid) == []
    assert s.get_conversation(other)["title"] == "keep me"
    assert len(s.get_messages(other)) == 1
    assert s.get_reports(other)[0]["markdown"] == "# keep"


def test_delete_missing_conversation_returns_false():
    s = Store(":memory:")

    assert s.delete_conversation("missing") is False
