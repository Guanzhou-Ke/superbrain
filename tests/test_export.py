from backend.export import (
    markdown_to_reportlab_blocks,
    math_to_reportlab_markup,
    markdown_line_to_reportlab_markup,
)


def test_math_to_reportlab_markup_renders_common_latex():
    markup = math_to_reportlab_markup(r"\int_0^1 x^2 dx")

    assert "∫" in markup
    assert "<sub>0</sub>" in markup
    assert "<super>1</super>" in markup
    assert "x<super>2</super>" in markup


def test_markdown_line_to_reportlab_markup_renders_inline_math():
    markup = markdown_line_to_reportlab_markup(r"Energy $E=mc^2$ is useful")

    assert "$" not in markup
    assert "Energy" in markup
    assert "E=mc<super>2</super>" in markup


def test_markdown_to_reportlab_blocks_renders_multiline_math_block():
    blocks = markdown_to_reportlab_blocks("Before\n\n$$\n\\int_0^1 x^2 dx\n$$")

    math_blocks = [markup for kind, markup in blocks if kind == "math"]
    assert math_blocks
    assert "∫" in math_blocks[0]
    assert "<sub>0</sub>" in math_blocks[0]
