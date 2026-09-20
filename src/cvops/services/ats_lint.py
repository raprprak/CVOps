"""ATS compliance linter (`.claude/rules/ats-compliance.md` rules L1-L10).

Each rule is a pure function over `(resume, pdf_bytes)` and returns zero or more
`Finding`s. Text extraction uses two independent codebases -- poppler's `pdftotext`
binary (subprocess) and pdfplumber (Python, pdfminer.six-based) -- so a single
extractor's quirk can't hide a real parse failure; that's L1, the automated notepad
test. `pdftotext` must be on PATH (poppler-utils; see README / CI workflow). Errors fail
`cvops lint`; warnings are reported only.
"""

from __future__ import annotations

import io
import re
import shutil
import subprocess
from dataclasses import dataclass
from typing import Literal

import pdfplumber
import pypdf

from cvops.models.common import normalize_ws
from cvops.models.resolved import ResolvedResume


class MissingToolError(RuntimeError):
    """A required external tool (poppler's `pdftotext`) is not on PATH."""


Level = Literal["error", "warning"]

# Standard section headings an ATS dictionary-matches. Kept in sync with
# `.claude/rules/ats-compliance.md`; `resolved.SECTION_HEADINGS` + `skills_heading`
# must only ever produce values from this set.
STANDARD_HEADINGS = frozenset(
    {
        "Summary",
        "Experience",
        "Education",
        "Skills",
        "Technical Skills",
        "Projects",
        "Certifications",
        "Publications",
    }
)

_METRIC_RE = re.compile(r"\d")
_CONTACT_LABEL_RE = re.compile(r"^(Email|Phone|Location|[A-Za-z][\w .'-]{0,30}):\s*(.+)$")


@dataclass(frozen=True)
class Finding:
    rule: str
    level: Level
    message: str


@dataclass(frozen=True)
class LintResult:
    findings: tuple[Finding, ...]

    @property
    def errors(self) -> tuple[Finding, ...]:
        return tuple(f for f in self.findings if f.level == "error")

    @property
    def warnings(self) -> tuple[Finding, ...]:
        return tuple(f for f in self.findings if f.level == "warning")

    @property
    def ok(self) -> bool:
        return not self.errors


def _err(rule: str, message: str) -> Finding:
    return Finding(rule=rule, level="error", message=message)


def _warn(rule: str, message: str) -> Finding:
    return Finding(rule=rule, level="warning", message=message)


# -- extraction ------------------------------------------------------------------------


@dataclass(frozen=True)
class ExtractedPage:
    """One page's text as two independent extractors see it."""

    pdftotext_lines: list[str]  # poppler `pdftotext -layout`, in document order
    plumber_lines: list[
        dict
    ]  # visual row *segments*: {"text", "x0", "x1", "top"} -- see _row_segments


# A gap between two words on the same text row wider than this is treated as a column
# gutter rather than normal spacing (word gaps in prose run a few points; A4 margins of
# 1.6cm each side leave nowhere near this much room unless there are two blocks of text
# side by side).
_COLUMN_GAP_PT = 24.0
_ROW_TOLERANCE_PT = 3.0

# A date (range) as the template prints it: "Jan 2021 - Present", "2015 - 2019", "Jun 2019".
# Right-aligned dates are the one thing that legitimately sits far from the left margin.
_MONTH_YEAR = r"(?:[A-Z][a-z]{2,8}\.? )?\d{4}"
_DATE_FRAGMENT = re.compile(rf"{_MONTH_YEAR}(?:\s*[–—-]\s*(?:{_MONTH_YEAR}|Present|Current))?")


def _row_segments(words: list[dict]) -> list[dict]:
    """Group words into visual rows by `top`, then split each row wherever the gap to
    the next word exceeds `_COLUMN_GAP_PT`. A single-column page produces one segment
    per row; a page with side-by-side columns produces >=2 segments sharing a row --
    that's the condition check_single_column looks for."""
    rows: list[list[dict]] = []
    for word in sorted(words, key=lambda w: (w["top"], w["x0"])):
        for row in rows:
            if abs(row[0]["top"] - word["top"]) <= _ROW_TOLERANCE_PT:
                row.append(word)
                break
        else:
            rows.append([word])

    segments: list[dict] = []
    for row in rows:
        row.sort(key=lambda w: w["x0"])
        current = [row[0]]
        for word in row[1:]:
            if word["x0"] - current[-1]["x1"] > _COLUMN_GAP_PT:
                segments.append(_merge_segment(current))
                current = [word]
            else:
                current.append(word)
        segments.append(_merge_segment(current))
    return segments


def _merge_segment(words: list[dict]) -> dict:
    return {
        "text": " ".join(w["text"] for w in words),
        "x0": words[0]["x0"],
        "x1": words[-1]["x1"],
        "top": words[0]["top"],
    }


def _run_pdftotext(pdf_bytes: bytes) -> list[list[str]]:
    """`pdftotext -layout` on stdin/stdout, split into per-page line lists on the form
    feed (\\x0c) poppler inserts between pages."""
    if shutil.which("pdftotext") is None:
        raise MissingToolError(
            "`pdftotext` not found on PATH (poppler-utils). Install it: "
            "`brew install poppler` (macOS) or `apt-get install poppler-utils` (CI)."
        )
    result = subprocess.run(
        ["pdftotext", "-layout", "-", "-"],
        input=pdf_bytes,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise MissingToolError(
            f"pdftotext failed (exit {result.returncode}): {result.stderr.decode()}"
        )
    raw_pages = result.stdout.decode("utf-8").split("\x0c")
    if raw_pages and raw_pages[-1] == "":
        raw_pages = raw_pages[:-1]  # trailing form feed after the last page
    return [
        [normalize_ws(line) for line in page.splitlines() if line.strip()] for page in raw_pages
    ]


def extract(pdf_bytes: bytes) -> list[ExtractedPage]:
    pdftotext_pages = _run_pdftotext(pdf_bytes)
    pages: list[ExtractedPage] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as doc:
        for pdftotext_lines, plumber_page in zip(pdftotext_pages, doc.pages, strict=True):
            plumber_lines = _row_segments(plumber_page.extract_words())
            for seg in plumber_lines:
                seg["text"] = normalize_ws(seg["text"])
            pages.append(
                ExtractedPage(pdftotext_lines=pdftotext_lines, plumber_lines=plumber_lines)
            )
    return pages


def _flat(pages: list[ExtractedPage], attr: str) -> list[str]:
    out: list[str] = []
    for page in pages:
        out.extend(getattr(page, attr))
    return out


# -- L1 / L2: round-trip and reading order ----------------------------------------------


def _find_all_in_order(expected: list[str], extracted: list[str]) -> list[str]:
    """Greedily match `expected` strings against `extracted` lines in order.

    A wrapped bullet can span multiple extracted lines and a heading can share a line
    with the rule under it, so matching is substring/concatenation based: each expected
    string must be found, in order, within the extracted text taken as one stream.
    Returns the expected strings that could not be matched, in the order they were
    expected (an empty list means L1/L2 both pass for this extractor).
    """
    stream = normalize_ws(" ".join(extracted))
    cursor = 0
    missing: list[str] = []
    for text in expected:
        needle = normalize_ws(text)
        position = stream.find(needle, cursor)
        if position == -1:
            missing.append(text)
            continue
        cursor = position + len(needle)
    return missing


def check_round_trip_and_order(resume: ResolvedResume, pages: list[ExtractedPage]) -> list[Finding]:
    expected = resume.reading_order()
    findings: list[Finding] = []
    for extractor, attr in (("pdftotext", "pdftotext_lines"), ("pdfplumber", "plumber_lines")):
        lines = _flat(pages, attr)
        flat_text = [ln if isinstance(ln, str) else ln["text"] for ln in lines]
        missing = _find_all_in_order(expected, flat_text)
        for text in missing:
            findings.append(
                _err(
                    "L1",
                    f"[{extractor}] not found in reading order in the extracted text: {text!r}",
                )
            )
    return findings


# -- L3: single column -------------------------------------------------------------------


def check_single_column(pages: list[ExtractedPage], *, bucket_pt: float = 6.0) -> list[Finding]:
    """Flag a persistent second column: `_row_segments` already splits each visual row
    at gaps wide enough to be a column gutter (`_COLUMN_GAP_PT`), so a single stray
    trailing fragment (e.g. this template's right-aligned "#h(1fr) <date>") is normal --
    real problem is a *second x-position that recurs across multiple rows*, i.e. an
    actual column of content running down the page rather than a one-off right-aligned
    token. That recurrence, not a single line's offset, is the multi-column signature
    the ATS-compliance rule describes ("columns interleave text").

    Right-aligned dates do recur (same format, so nearly the same width and x0 on every
    entry), so date fragments are left out of the count: a date on the same line as its
    title is read in order and interleaves nothing. Any other text in a second column
    is still flagged. Known limit: a column made only of dates would pass."""
    findings: list[Finding] = []
    for page in pages:
        if not page.plumber_lines:
            continue
        baseline = min(seg["x0"] for seg in page.plumber_lines)
        rows: dict[float, list[dict]] = {}
        for seg in page.plumber_lines:
            rows.setdefault(round(seg["top"] / _ROW_TOLERANCE_PT), []).append(seg)

        secondary_buckets: dict[float, list[dict]] = {}
        for row_segments in rows.values():
            row_segments.sort(key=lambda s: s["x0"])
            for seg in row_segments[1:]:  # every segment after the first on this row
                if _DATE_FRAGMENT.fullmatch(seg["text"].strip()):
                    continue
                bucket = round((seg["x0"] - baseline) / bucket_pt) * bucket_pt
                secondary_buckets.setdefault(bucket, []).append(seg)

        for bucket, segs in secondary_buckets.items():
            rows_hit = {round(s["top"] / _ROW_TOLERANCE_PT) for s in segs}
            if len(rows_hit) >= 2:
                examples = ", ".join(repr(s["text"]) for s in segs[:3])
                findings.append(
                    _err(
                        "L3",
                        f"a second column of content recurs at x-offset ~{bucket:.0f}pt "
                        f"across {len(rows_hit)} rows -- likely a multi-column layout: {examples}",
                    )
                )
    return findings


# -- L4: standard headings ---------------------------------------------------------------


def check_standard_headings(resume: ResolvedResume) -> list[Finding]:
    findings: list[Finding] = []
    for section in resume.sections:
        heading = resume.heading(section)
        if heading not in STANDARD_HEADINGS:
            findings.append(
                _err("L4", f"non-standard section heading {heading!r} (section {section!r})")
            )
    return findings


# -- L5: contact info as labelled text ----------------------------------------------------


def check_contact_as_text(resume: ResolvedResume) -> list[Finding]:
    findings: list[Finding] = []
    for item in resume.contact_items():
        if not _CONTACT_LABEL_RE.match(item):
            findings.append(_err("L5", f"contact item has no literal label: {item!r}"))
    return findings


# -- L6: fonts embedded with ToUnicode -----------------------------------------------------


def check_fonts(pdf_bytes: bytes) -> list[Finding]:
    findings: list[Finding] = []
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    for page_num, page in enumerate(reader.pages, start=1):
        resources_ref = page.get("/Resources")
        resources = resources_ref.get_object() if resources_ref is not None else {}
        fonts_ref = resources.get("/Font") if resources else None
        fonts = fonts_ref.get_object() if fonts_ref is not None else {}
        for font_ref in fonts.values():
            font = font_ref.get_object()
            base_font = str(font.get("/BaseFont", "?"))
            descriptor_ref = font.get("/FontDescriptor")
            descendants_ref = font.get("/DescendantFonts")
            descendant_descriptor = False
            if descendants_ref is not None:
                for descendant_ref in descendants_ref.get_object():
                    descendant = descendant_ref.get_object()
                    if descendant.get("/FontDescriptor") is not None:
                        descendant_descriptor = True
            embedded = descriptor_ref is not None or descendant_descriptor
            if not embedded:
                findings.append(_err("L6", f"page {page_num}: font {base_font} is not embedded"))
            if "/ToUnicode" not in font:
                findings.append(
                    _err("L6", f"page {page_num}: font {base_font} has no /ToUnicode CMap")
                )
    return findings


# -- L7: no images, no tables --------------------------------------------------------------


def check_no_images(pdf_bytes: bytes) -> list[Finding]:
    findings: list[Finding] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as doc:
        for page_num, page in enumerate(doc.pages, start=1):
            if page.images:
                findings.append(
                    _err("L7", f"page {page_num}: {len(page.images)} embedded image(s) found")
                )
    return findings


# -- L8: page count ---------------------------------------------------------------------


def check_page_count(resume: ResolvedResume, pages: list[ExtractedPage]) -> list[Finding]:
    if len(pages) > resume.max_pages:
        return [
            _err("L8", f"compiled to {len(pages)} page(s), target max_pages is {resume.max_pages}")
        ]
    return []


# -- L9: provenance -----------------------------------------------------------------------


def check_provenance(resume: ResolvedResume) -> list[Finding]:
    """Every rendered bullet is required to carry a master id by construction
    (ResolvedText.id is non-optional and only resolve.py produces one) -- so this rule
    checks the one thing that *can* drift: overrides, which are reported, not blocked."""
    findings: list[Finding] = []
    for item in resume.text_items():
        if not item.id:
            findings.append(_err("L9", "a rendered text block has no provenance id"))
        if item.overridden:
            findings.append(_warn("L9", f"{item.id!r} text overridden from master: {item.text!r}"))
    return findings


# -- L10: content hygiene (warnings only) --------------------------------------------------


def check_content_hygiene(resume: ResolvedResume) -> list[Finding]:
    findings: list[Finding] = []
    for item in resume.text_items():
        if item.metric is False:
            continue  # explicitly marked as not a metric bullet -- not a finding
        if item.metric is None and not _METRIC_RE.search(item.text):
            findings.append(_warn("L10", f"{item.id!r} has no number: {item.text!r}"))
    if resume.skills and "skills" in resume.sections:
        skills_index = resume.sections.index("skills")
        if skills_index > 1:
            findings.append(
                _warn(
                    "L10",
                    f"Skills is section {skills_index + 1} of {len(resume.sections)} -- "
                    "move it higher so parsers weight it early",
                )
            )
    return findings


# -- entry point ----------------------------------------------------------------------------

RULES_NEEDING_PDF = ("L1", "L3", "L6", "L7", "L8")


def lint(resume: ResolvedResume, pdf_bytes: bytes) -> LintResult:
    pages = extract(pdf_bytes)
    findings: list[Finding] = []
    findings += check_round_trip_and_order(resume, pages)
    findings += check_single_column(pages)
    findings += check_standard_headings(resume)
    findings += check_contact_as_text(resume)
    findings += check_fonts(pdf_bytes)
    findings += check_no_images(pdf_bytes)
    findings += check_page_count(resume, pages)
    findings += check_provenance(resume)
    findings += check_content_hygiene(resume)
    return LintResult(findings=tuple(findings))
