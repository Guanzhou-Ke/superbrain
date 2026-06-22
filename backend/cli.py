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
    elif ns.cmd == "mentor" and ns.action == "refresh":
        path = asyncio.run(_make_researcher().build(ns.id))
        print(f"已写入 {path}")


if __name__ == "__main__":
    main()
