from __future__ import annotations

from io import BytesIO
from re import finditer, sub
from xml.sax.saxutils import escape

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

LATEX_SYMBOLS = {
    r"\alpha": "α",
    r"\beta": "β",
    r"\gamma": "γ",
    r"\delta": "δ",
    r"\epsilon": "ε",
    r"\lambda": "λ",
    r"\mu": "μ",
    r"\pi": "π",
    r"\sigma": "σ",
    r"\theta": "θ",
    r"\omega": "ω",
    r"\Delta": "Δ",
    r"\Omega": "Ω",
    r"\sum": "∑",
    r"\int": "∫",
    r"\infty": "∞",
    r"\leq": "≤",
    r"\geq": "≥",
    r"\neq": "≠",
    r"\times": "×",
    r"\cdot": "·",
    r"\pm": "±",
}


def safe_export_filename(title: str, extension: str) -> str:
    stem = sub(r"[^A-Za-z0-9._-]+", "-", title.strip()).strip("-._")
    return f"{stem or 'conversation'}.{extension}"


def format_conversation_markdown(
    conversation: dict,
    messages: list[dict],
    reports: list[dict],
    mentor_names: dict[str, str],
) -> str:
    lines = [
        f"# {conversation['title']}",
        "",
        f"- Created: {conversation['created_at']}",
        f"- Updated: {conversation['updated_at']}",
        "",
    ]

    for msg in messages:
        if msg.get("is_silent"):
            continue
        role = msg.get("role")
        mentor_id = msg.get("mentor_id")
        if role == "user":
            heading = "User"
        elif mentor_id == "moderator" or role in {"moderator", "assistant"}:
            heading = "Synthesis"
        elif mentor_id:
            heading = mentor_names.get(mentor_id, mentor_id)
        else:
            heading = role or "Message"

        lines.extend([
            f"## {heading}",
            "",
            msg.get("content", ""),
            "",
        ])

    for report in reports:
        lines.extend([
            "## Deep Review Report",
            "",
            report.get("markdown", ""),
            "",
        ])

    return "\n".join(lines).rstrip() + "\n"


def math_to_reportlab_markup(formula: str) -> str:
    text = formula.strip()
    text = sub(
        r"\\frac\{([^{}]+)\}\{([^{}]+)\}",
        lambda m: f"({m.group(1)})/({m.group(2)})",
        text,
    )
    for latex, symbol in LATEX_SYMBOLS.items():
        text = text.replace(latex, symbol)
    text = sub(r"\\([A-Za-z]+)", r"\1", text)
    text = escape(text)
    text = sub(r"\^\{([^{}]+)\}", r"<super>\1</super>", text)
    text = sub(r"_\{([^{}]+)\}", r"<sub>\1</sub>", text)
    text = sub(r"\^([A-Za-z0-9+\-=])", r"<super>\1</super>", text)
    text = sub(r"_([A-Za-z0-9+\-=])", r"<sub>\1</sub>", text)
    return text


def markdown_line_to_reportlab_markup(line: str) -> str:
    parts: list[str] = []
    pos = 0
    for match in finditer(r"\$(?!\$)(.+?)(?<!\$)\$", line):
        parts.append(escape(line[pos:match.start()]))
        parts.append(math_to_reportlab_markup(match.group(1)))
        pos = match.end()
    parts.append(escape(line[pos:]))
    return "".join(parts)


def markdown_to_reportlab_blocks(markdown: str) -> list[tuple[str, str]]:
    blocks: list[tuple[str, str]] = []
    in_math = False
    math_lines: list[str] = []
    for raw_line in markdown.splitlines():
        line = raw_line.rstrip()
        if in_math:
            if line.strip() == "$$":
                blocks.append(("math", math_to_reportlab_markup(" ".join(math_lines))))
                math_lines = []
                in_math = False
            else:
                math_lines.append(line)
            continue

        stripped = line.strip()
        if stripped == "$$":
            in_math = True
            math_lines = []
        elif stripped.startswith("$$") and stripped.endswith("$$") and len(stripped) > 4:
            blocks.append(("math", math_to_reportlab_markup(stripped[2:-2])))
        elif not line:
            blocks.append(("space", ""))
        elif line.startswith("# "):
            blocks.append(("title", markdown_line_to_reportlab_markup(line[2:])))
        elif line.startswith("## "):
            blocks.append(("heading2", markdown_line_to_reportlab_markup(line[3:])))
        else:
            blocks.append(("normal", markdown_line_to_reportlab_markup(line)))

    if in_math and math_lines:
        blocks.append(("math", math_to_reportlab_markup(" ".join(math_lines))))
    return blocks


def markdown_to_pdf_bytes(markdown: str) -> bytes:
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    styles = getSampleStyleSheet()
    for style_name in ("Normal", "Title", "Heading1", "Heading2", "Code"):
        styles[style_name].fontName = "STSong-Light"

    story = []
    for kind, markup in markdown_to_reportlab_blocks(markdown):
        if kind == "space":
            story.append(Spacer(1, 8))
        elif kind == "title":
            story.append(Paragraph(markup, styles["Title"]))
        elif kind == "heading2":
            story.append(Paragraph(markup, styles["Heading2"]))
        elif kind == "math":
            story.append(Paragraph(markup, styles["Normal"]))
        else:
            story.append(Paragraph(markup, styles["Normal"]))

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4)
    doc.build(story)
    return buf.getvalue()
