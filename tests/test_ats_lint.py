"""Unit tests for each lint rule's pure logic, using reportlab-synthesized PDFs (see
pdf_fixtures.py) rather than a real Typst compile -- see that module's docstring for why.
"""

from __future__ import annotations

from cvops.models.master import Master
from cvops.models.resolved import ResolvedResume
from cvops.models.target import Target
from cvops.services import ats_lint
from cvops.services.resolve import resolve
from tests.pdf_fixtures import single_column_pdf, two_column_pdf


def _resume(master: Master, basic_target: Target) -> ResolvedResume:
    return resolve(master, basic_target, slug="basic")


def test_round_trip_passes_when_every_string_present_in_order(master, basic_target) -> None:
    resume = _resume(master, basic_target)
    pdf = single_column_pdf(resume.reading_order())
    pages = ats_lint.extract(pdf)
    findings = ats_lint.check_round_trip_and_order(resume, pages)
    assert findings == []


def test_round_trip_flags_a_missing_string(master, basic_target) -> None:
    resume = _resume(master, basic_target)
    order = resume.reading_order()
    dropped = order[len(order) // 2]
    pdf = single_column_pdf([line for line in order if line != dropped])
    pages = ats_lint.extract(pdf)
    findings = ats_lint.check_round_trip_and_order(resume, pages)
    assert findings and all(f.rule == "L1" and f.level == "error" for f in findings)
    assert any(dropped in f.message for f in findings)


def test_round_trip_flags_reordering(master, basic_target) -> None:
    resume = _resume(master, basic_target)
    order = resume.reading_order()
    shuffled = [order[1], order[0], *order[2:]]  # swap the first two lines
    pdf = single_column_pdf(shuffled)
    pages = ats_lint.extract(pdf)
    findings = ats_lint.check_round_trip_and_order(resume, pages)
    assert findings  # at least one extractor reports the out-of-order line as "missing"


def test_single_column_passes_for_left_aligned_text() -> None:
    pdf = single_column_pdf(["Name", "Email: a@b.com", "Experience", "- did a thing"])
    findings = ats_lint.check_single_column(ats_lint.extract(pdf))
    assert findings == []


def test_single_column_catches_two_columns() -> None:
    pdf = two_column_pdf(["Skills", "Python", "FastAPI"], ["Experience", "Acme Co", "2020-2024"])
    findings = ats_lint.check_single_column(ats_lint.extract(pdf))
    assert findings and all(f.rule == "L3" for f in findings)


def test_single_column_does_not_flag_right_aligned_dates() -> None:
    """Regression guard: the template right-aligns dates with `#h(1fr)`, which puts a
    lone fragment far from the left margin on heading rows. That must not look like a
    second column -- each row's date sits at a *different* x0 (dates are different
    lengths), so it never recurs at the same offset the way a real second column would.
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buf = __import__("io").BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    rows = [
        ("Senior Backend Engineer, Acme Analytics", "Apr 2022 - Present"),
        ("Backend Engineer, Globex Payments", "Jul 2019 - Mar 2022"),
        ("Engineer, Beta Inc", "2015 - 2019"),
    ]
    y = height - 60
    for left, right in rows:
        c.drawString(60, y, left)
        c.drawRightString(width - 60, y, right)
        y -= 16
        c.drawString(60, y, "- a bullet with a number 42 in it")
        y -= 20
    c.showPage()
    c.save()

    findings = ats_lint.check_single_column(ats_lint.extract(buf.getvalue()))
    assert findings == []


def test_standard_headings(master) -> None:
    good = Target.model_validate({"skills": ["sk-python"], "skills_heading": "Technical Skills"})
    resume = resolve(master, good, slug="t")
    assert ats_lint.check_standard_headings(resume) == []


def test_contact_labels(master, basic_target) -> None:
    resume = _resume(master, basic_target)
    assert ats_lint.check_contact_as_text(resume) == []


def test_contact_label_regex_rejects_unlabelled_text() -> None:
    # resolved.py always prepends a literal label ("Email: ..."), so this rule can only
    # ever fail if that construction is broken -- test the regex directly to document
    # the boundary the check enforces.
    assert ats_lint._CONTACT_LABEL_RE.match("Email: a@b.com")
    assert not ats_lint._CONTACT_LABEL_RE.match("a@b.com")
    assert not ats_lint._CONTACT_LABEL_RE.match(" a@b.com")  # icon glyph, no label


def test_fonts_embedded_and_tagged() -> None:
    pdf = single_column_pdf(["hello"])
    findings = ats_lint.check_fonts(pdf)
    # reportlab's base-14 fonts are NOT embedded and carry no ToUnicode -- this fixture
    # is expected to fail L6, which documents exactly why CVOps requires Typst (0.14+
    # embeds and tags by default) rather than accepting "any PDF producer".
    assert findings and all(f.rule == "L6" for f in findings)


def test_no_images() -> None:
    pdf = single_column_pdf(["hello"])
    assert ats_lint.check_no_images(pdf) == []


def test_page_count(master, basic_target) -> None:
    resume = _resume(master, basic_target)
    pdf = single_column_pdf(resume.reading_order())
    pages = ats_lint.extract(pdf)
    assert ats_lint.check_page_count(resume, pages) == []

    resume_1pg = resume.model_copy(update={"max_pages": 1})
    two_page_pdf = single_column_pdf(resume.reading_order() * 40, pages=2)
    findings = ats_lint.check_page_count(resume_1pg, ats_lint.extract(two_page_pdf))
    assert findings and findings[0].rule == "L8"


def test_provenance_flags_overrides_as_warnings(master, basic_target) -> None:
    resume = _resume(master, basic_target)
    findings = ats_lint.check_provenance(resume)
    warnings = [f for f in findings if f.level == "warning"]
    assert any("exp-a-01" in f.message for f in warnings)
    assert all(f.rule == "L9" for f in findings)


def test_content_hygiene_flags_bullet_with_no_number(master) -> None:
    target = Target.model_validate(
        {"projects": [{"ref": "prj-a"}]}  # prj-a-01 = "Built it." -- no digit anywhere
    )
    resume = resolve(master, target, slug="t")
    findings = ats_lint.check_content_hygiene(resume)
    assert any(f.rule == "L10" and "prj-a-01" in f.message for f in findings)


def test_content_hygiene_respects_explicit_metric_false(master) -> None:
    target = Target.model_validate({"projects": [{"ref": "prj-a"}]})
    resume = resolve(master, target, slug="t")
    resume.projects[0].bullets[0] = (
        resume.projects[0].bullets[0].model_copy(update={"metric": False})
    )
    findings = ats_lint.check_content_hygiene(resume)
    assert not any(f.rule == "L10" and "prj-a-01" in f.message for f in findings)


def test_lint_result_helpers(master, basic_target) -> None:
    resume = _resume(master, basic_target)
    pdf = single_column_pdf(resume.reading_order())
    result = ats_lint.lint(resume, pdf)
    # L6 will fire (reportlab fonts aren't embedded/tagged) but nothing else structural
    # should, proving the aggregate `lint()` wiring is correct.
    assert result.errors  # from L6 on this synthetic PDF
    assert all(f.rule == "L6" for f in result.errors)
    assert result.ok is False
