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

    assert s.update_conversation_title(cid, "无人机强化学习安全约束") is True
    assert s.get_conversation(cid)["title"] == "无人机强化学习安全约束"
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
