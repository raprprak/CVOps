"""Build small synthetic PDFs with reportlab so ats_lint's pure functions can be unit
tested without a working Typst install. Not part of the shipped package -- reportlab is
a test-only convenience, not a `cvops` runtime dependency. The real acceptance test for
the linter is running it against a `cvops build` output; these fixtures approximate that
closely enough to exercise each check's logic (extraction, column detection, page count,
font embedding) in isolation and in CI without requiring Typst.
"""

from __future__ import annotations

import io

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def single_column_pdf(lines: list[str], *, pages: int = 1) -> bytes:
    """One line per row, left-aligned, top to bottom -- a valid ATS-safe layout."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    per_page = max(1, -(-len(lines) // pages))
    for page_lines in (lines[i : i + per_page] for i in range(0, len(lines), per_page)):
        y = height - 60
        for line in page_lines:
            c.drawString(60, y, line)
            y -= 16
        c.showPage()
    c.save()
    return buf.getvalue()


def two_column_pdf(left_lines: list[str], right_lines: list[str]) -> bytes:
    """Two side-by-side columns on the same rows -- what L3 must catch."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    y = height - 60
    for left, right in zip(left_lines, right_lines, strict=True):
        c.drawString(60, y, left)
        c.drawString(width / 2 + 40, y, right)
        y -= 16
    c.showPage()
    c.save()
    return buf.getvalue()
