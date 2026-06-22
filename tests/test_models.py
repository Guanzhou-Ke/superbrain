from backend.models import RouteDecision, SpeakerDirective, ChatRequest, MentorReply


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


def test_speaker_directive_defaults():
    s = SpeakerDirective(mentor_id="a")
    assert s.directive == ""
    assert s.order == 0


def test_chat_request_defaults():
    r = ChatRequest(content="hello")
    assert r.mode == "chat"
    assert r.conversation_id is None


def test_chat_request_mode_validation():
    r = ChatRequest(content="x", mode="review")
    assert r.mode == "review"


def test_mentor_reply_fields():
    reply = MentorReply(mentor_id="brooks", name="Brooks", color="#aabbcc", content="text")
    assert reply.is_silent is False
    assert reply.mentor_id == "brooks"
