from backend.mentors import MentorLibrary, CRITICAL_CONSTITUTION, STAGE_CONTRACTS

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


def test_render_system_prompt_includes_stage_contract():
    lib = MentorLibrary(LIB)
    prompt = lib.render_system_prompt(lib.get("alice"), stage="explore")
    assert STAGE_CONTRACTS["explore"].split("\n")[0] in prompt


def test_get_unknown_raises():
    import pytest
    with pytest.raises(KeyError):
        MentorLibrary(LIB).get("nobody")


def test_default_config_includes_kaiming_and_renders_all_prompts():
    lib = MentorLibrary("config/mentors")
    ids = {card.id for card in lib.roster()}

    assert "kaiming" in ids
    for card in lib.roster():
        prompt = lib.render_system_prompt(lib.get(card.id))
        assert card.name in prompt
        assert "你的学术 taste" in prompt
        assert CRITICAL_CONSTITUTION.split("\n")[0] in prompt
