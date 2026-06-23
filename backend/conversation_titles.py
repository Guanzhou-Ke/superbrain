import json
import re

from backend.providers.base import LLMProvider

TITLE_MAX_CHARS = 28


def summarize_conversation_title(user_msg: str, max_chars: int = TITLE_MAX_CHARS) -> str:
    text = re.sub(r"\s+", " ", user_msg).strip()
    text = re.sub(r"^/review\s+", "", text, flags=re.IGNORECASE).strip()
    text = text.strip(" ，。！？!?：:")
    if len(text) <= max_chars:
        return text or "新会话"
    return text[:max_chars].rstrip(" ，。！？!?：:") + "…"


def is_generic_conversation_title(title: str | None) -> bool:
    if not title:
        return True
    normalized = title.strip().lower()
    return (
        normalized.startswith("conversation ")
        or normalized in {"conversation", "new conversation", "新会话", "未命名会话"}
    )


def is_user_derived_conversation_title(title: str | None, user_msg: str) -> bool:
    if not title or not user_msg:
        return False
    normalized_title = _normalize_for_match(title.rstrip("…"))
    normalized_user = _normalize_for_match(user_msg)
    if len(normalized_title) < 4:
        return False
    return normalized_user.startswith(normalized_title)


def should_generate_conversation_title(
    title: str | None,
    user_msg: str,
    existing_messages: list[dict],
) -> bool:
    if existing_messages:
        return False
    return (
        is_generic_conversation_title(title)
        or is_user_derived_conversation_title(title, user_msg)
    )


async def generate_conversation_title(
    provider: LLMProvider,
    user_msg: str,
    max_chars: int = TITLE_MAX_CHARS,
) -> str:
    fallback = summarize_conversation_title(user_msg, max_chars=max_chars)
    prompt = (
        "你是会话标题生成器。请把用户第一条消息抽象成一个短标题。\n"
        "要求：\n"
        "- 中文优先，8 到 16 个汉字；英文则 2 到 6 个词。\n"
        "- 表达主题、目标或研究对象，不要逐字复述用户原句。\n"
        "- 不要使用“请问”“帮我”“关于”等客套开头。\n"
        "- 不要输出引号、编号、句号或解释。\n"
        "- 只输出标题本身。"
    )
    try:
        raw = await provider.complete(
            [
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_msg[:1200]},
            ],
            temperature=0,
        )
    except Exception:
        return fallback
    return normalize_generated_title(raw, fallback, max_chars=max_chars)


def normalize_generated_title(
    raw: str,
    fallback: str,
    max_chars: int = TITLE_MAX_CHARS,
) -> str:
    text = (raw or "").strip()
    title = _extract_json_title(text)
    if not title:
        title = text.splitlines()[0] if text else ""
    title = re.sub(r"^[-*#\d.、\s]*(标题|title)\s*[:：]\s*", "", title, flags=re.IGNORECASE)
    title = title.strip(" \t\r\n\"'`“”‘’《》<>#*")
    title = re.sub(r"\s+", " ", title)
    title = re.sub(r"[。！？!?；;，,：:]+$", "", title)
    title = re.sub(r"^(请问|请帮我|帮我|关于)\s*", "", title)
    if not title or is_generic_conversation_title(title):
        return fallback or "新会话"
    if len(title) > max_chars:
        return summarize_conversation_title(title, max_chars=max_chars)
    return title


def _extract_json_title(text: str) -> str:
    if not text or "{" not in text or "}" not in text:
        return ""
    try:
        start, end = text.find("{"), text.rfind("}")
        payload = json.loads(text[start : end + 1])
    except Exception:
        return ""
    if isinstance(payload, dict):
        value = payload.get("title")
        return value if isinstance(value, str) else ""
    return ""


def _normalize_for_match(text: str) -> str:
    compact = re.sub(r"\s+", "", text.strip().lower())
    return re.sub(r"[，。！？!?：:；;、,.\"'“”‘’《》<>`~\-_()\[\]{}]", "", compact)
