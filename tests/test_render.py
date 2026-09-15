import re

from cvops.models.master import Master
from cvops.models.target import Target
from cvops.services.render import render_typ, typst_escape, typst_string_escape
from cvops.services.resolve import resolve


def test_markup_escape_covers_every_special() -> None:
    raw = "a\\b#c*d_e`f$g<h>i@j[k]l{m}n~o/p-q+r=s't\"u"
    escaped = typst_escape(raw)
    # every special is preceded by exactly one backslash; nothing else changes
    assert typst_escape("plain text 123 ,.;:!?()%&") == "plain text 123 ,.;:!?()%&"
    for ch in "\\#*_`$<>@[]{}~/-+='\"":
        assert f"\\{ch}" in escaped
    assert "--" not in typst_escape("a -- b")


def test_string_escape() -> None:
    assert typst_string_escape('say "hi" \\ bye') == 'say \\"hi\\" \\\\ bye'


def test_rendered_source_has_no_unescaped_specials_from_data(
    master: Master, basic_target: Target
) -> None:
    resume = resolve(master, basic_target, slug="basic")
    source = render_typ(resume)

    # The summary contains *quality*, &, #speed and [reliably] — all must arrive escaped.
    assert "ships \\*quality\\* & \\#speed \\[reliably\\]." in source
    # The project URL is printed escaped as text and raw (string-escaped) inside #link("...").
    assert '#link("https://example.com/a?b=1&c=\\"2\\"")' in source
    assert 'https:\\/\\/example.com\\/a?b\\=1&c\\=\\"2\\"' in source
    # C++ survives.
    assert "C\\+\\+" in source
    # The override text is what prints; the master text is not.
    assert "rewritten for this target" in source
    assert "measured 50% better" not in source


def test_rendered_source_prints_sections_in_target_order(
    master: Master, basic_target: Target
) -> None:
    resume = resolve(master, basic_target, slug="basic")
    source = render_typ(resume)
    headings = re.findall(r"^== (.+)$", source, flags=re.MULTILINE)
    assert headings == [
        "Technical Skills",
        "Experience",
        "Summary",
        "Projects",
        "Education",
        "Certifications",
    ]
    assert source.startswith("#set document(")
    assert "#set smartquote(enabled: false)" in source
    assert "columns" not in source and "grid(" not in source  # single-column by construction


def test_rendered_source_contains_every_reading_order_string_in_order(
    master: Master, basic_target: Target
) -> None:
    """The template must print strings in reading_order() order (L1/L2 rely on it)."""
    resume = resolve(master, basic_target, slug="basic")
    source = render_typ(resume)
    cursor = 0
    for expected in resume.reading_order():
        needle = typst_escape(expected)
        position = source.find(needle, cursor)
        assert position >= 0, f"{expected!r} not found in rendered source after offset {cursor}"
        cursor = position + len(needle)
