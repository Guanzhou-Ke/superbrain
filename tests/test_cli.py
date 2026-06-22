from backend.cli import build_parser


def test_parser_has_mentor_add():
    p = build_parser()
    ns = p.parse_args(["mentor", "add", "卡帕西"])
    assert ns.cmd == "mentor" and ns.action == "add" and ns.name == "卡帕西"


def test_parser_has_mentor_refresh():
    p = build_parser()
    ns = p.parse_args(["mentor", "refresh", "karpathy"])
    assert ns.cmd == "mentor" and ns.action == "refresh" and ns.id == "karpathy"
