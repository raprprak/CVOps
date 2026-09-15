"""Render a ``ResolvedResume`` to Typst source, and compile Typst source to PDF.

Escaping strategy: rather than trusting every template expression to apply a filter, the
whole resume is converted to a plain dict and *every* string in it is Typst-escaped before
the template sees it. URL fields additionally get a ``<name>_code`` sibling escaped for use
inside a Typst string literal (``#link("...")``). The template therefore prints values raw.

Jinja delimiters are changed because Typst source is full of ``{``, ``}`` and ``#``:
blocks are ``((* ... *))``, variables ``<< ... >>``, comments ``((# ... #))``.
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Any

import jinja2

from cvops.models.resolved import ResolvedResume

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "resume"

# A fixed timestamp makes the PDF byte-reproducible for identical input (Typst writes the
# creation date into the file). The value itself is irrelevant.
BUILD_TIMESTAMP = dt.datetime(2000, 1, 1, tzinfo=dt.UTC)

# PDF/UA-1: tagged, with document title and language — what an accessibility-aware parser
# expects. Typst >= 0.14 validates the document against it at export time.
PDF_STANDARDS: tuple[str, ...] = ("ua-1",)

# Characters that mean something in Typst markup mode. Typst treats a backslash before any
# non-whitespace character as an escape, so escaping generously is safe. ``-`` is included
# to defeat the ``--``/``---`` dash shorthands and list markers; quotes to defeat smart
# quotes even if the template's ``#set smartquote(enabled: false)`` were removed.
_MARKUP_SPECIALS = frozenset("\\#*_`$<>@[]{}~/-+='\"")


class RenderError(RuntimeError):
    """Typst compilation failed."""


def typst_escape(value: object) -> str:
    """Escape a value for Typst *markup* mode so it renders as literal text."""
    return "".join(f"\\{ch}" if ch in _MARKUP_SPECIALS else ch for ch in str(value))


def typst_string_escape(value: object) -> str:
    """Escape a value for use inside a Typst *string literal* (``"..."`` in code mode)."""
    return str(value).replace("\\", "\\\\").replace('"', '\\"')


def _escape_tree(node: Any) -> Any:
    """Recursively markup-escape every string; add ``<key>_code`` for URL-like keys."""
    if isinstance(node, str):
        return typst_escape(node)
    if isinstance(node, list):
        return [_escape_tree(item) for item in node]
    if isinstance(node, dict):
        out: dict[str, Any] = {}
        for key, value in node.items():
            out[key] = _escape_tree(value)
            if key == "url" and isinstance(value, str):
                out["url_code"] = typst_string_escape(value)
        return out
    return node


def _environment() -> jinja2.Environment:
    return jinja2.Environment(
        loader=jinja2.FileSystemLoader(str(TEMPLATE_DIR)),
        block_start_string="((*",
        block_end_string="*))",
        variable_start_string="<<",
        variable_end_string=">>",
        comment_start_string="((#",
        comment_end_string="#))",
        trim_blocks=True,
        lstrip_blocks=True,
        keep_trailing_newline=True,
        autoescape=False,
        undefined=jinja2.StrictUndefined,
    )


def _skill_lines(resume: ResolvedResume) -> list[str]:
    """One escaped Typst line per skill group: ``*Label:* a, b, c`` or just ``a, b, c``."""
    lines: list[str] = []
    for group in resume.skill_groups():
        names = ", ".join(typst_escape(skill.name) for skill in group.skills)
        if group.label:
            lines.append(f"*{typst_escape(group.label)}:* {names}")
        else:
            lines.append(names)
    return lines


def render_typ(resume: ResolvedResume) -> str:
    """Render the resume to Typst source using the template named by the resume."""
    env = _environment()
    template = env.get_template(f"{resume.template}.typ.j2")
    context = {
        "r": _escape_tree(resume.model_dump(mode="json")),
        "contact_items": [typst_escape(item) for item in resume.contact_items()],
        "skill_lines": _skill_lines(resume),
        "doc_title": typst_string_escape(f"{resume.basics.name} - Resume"),
        "doc_author": typst_string_escape(resume.basics.name),
    }
    return template.render(**context)


def compile_pdf(source: str, *, standards: tuple[str, ...] = PDF_STANDARDS) -> bytes:
    """Compile Typst source to PDF bytes via typst-py, reproducibly."""
    import typst  # imported lazily so models/resolve stay importable without typst-py

    try:
        return typst.compile(
            source.encode("utf-8"),
            format="pdf",
            timestamp=BUILD_TIMESTAMP,
            pdf_standards=list(standards),
        )
    except TypeError as exc:  # an older typst-py without these keyword arguments
        raise RenderError(
            f"typst-py does not support reproducible/UA builds ({exc}); "
            "upgrade with `uv add 'typst>=0.14'`"
        ) from exc
    except Exception as exc:  # typst reports compile/validation failures as RuntimeError
        raise RenderError(str(exc)) from exc
