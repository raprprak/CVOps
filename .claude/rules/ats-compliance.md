# ATS compliance & recruiter-ranking rules

Domain rules the template (`templates/resume/*.typ.j2`), the renderer (`render.py`) and the linter (`ats_lint.py`) must satisfy. This is what makes a compiled resume "ATS-safe" rather than just a PDF. Rationale and the full rule list with error/warning levels: `docs/PLAN.md` § Lint rules.

## Why these rules (read once)
ATSes don't auto-reject; the "75% rejected" figure has no study behind it. What loses the interview call is (1) fields not populating cleanly in the ATS database so recruiter *search* misses the candidate, and (2) weak exact-keyword alignment with the JD. Parse fidelity and keyword coverage are the two load-bearing pillars; everything else is polish.

## Layout rules (enforce in the Typst template)
- Single-column only. No `grid`/`columns`/side-by-side blocks, no sidebars. Parsers read left-to-right; columns interleave text.
- Contact details as literal text with literal labels ("Email:", "Phone:"), never icon-only.
- Each contact item is an unbreakable box in the template: a long contact line wraps between items, never inside a URL or email (a split URL fails L1).
- Standard section headings only: Summary, Experience, Education, Skills / Technical Skills, Projects, Certifications, Publications. Parsers dictionary-match headings.
- No tables, no images, no text in headers/footers, no text boxes.
- Skills section near the top — parsers and recruiters weight early content.
- Typst emits tagged PDFs with correct Unicode mappings by default (0.14+), so the LaTeX `glyphtounicode` workaround is unnecessary — but L6 still checks fonts are embedded with ToUnicode, as a guard against template drift.

## Linter (`ats_lint.py`) — errors fail the build, warnings are reported
- L1 round-trip: every leaf string of the resolved resume appears in the extracted text, using two independent extractors (`pdftotext`, `pypdf`). The automated notepad test.
- L2 reading order: headings and bullets appear in source order.
- L3 single column: no second column of content recurs down the page (pdfplumber). Right-aligned dates are ignored: same-format dates have nearly the same width, start at the same x on every entry, and read in order on their line, so they would otherwise look like a column. Known limit: a column made only of dates would pass.
- L4 standard headings only.
- L5 contact as labelled text (regex over extracted text).
- L6 fonts embedded, ToUnicode present.
- L7 no images, no tables.
- L8 page count ≤ target `max_pages`.
- L9 provenance: every bullet resolves to a master ID (error); overrides reported (warning).
- L10 content hygiene (warnings): bullets with no number; inconsistent dates; Skills not near the top.

## Ranking guidance (feeds `match.py` / `tailor.py` — not linter failures)
- Mirror the JD's exact strings ("FastAPI" stays "FastAPI", "PostgreSQL" not "Postgres" if that's what the JD says). Recruiter search is exact-string.
- Order the Skills section to lead with JD terms.
- Quantify bullets: `Accomplished [X], as measured by [Y], by doing [Z]`.
- Zero fabrication is structural: `tailor` selects and orders master IDs; any rewritten text lives in `overrides` and is flagged by L9.

## Ground truth
Lint proves the PDF is parseable; only real portals prove it parses the way *they* parse. Log results of uploading a compiled PDF to LinkedIn import, a Workday "autofill with resume" flow and a Greenhouse application in `docs/ats-field-tests.md`; each failure becomes a lint rule or a template fix.

## Prior art
- **RenderCV** — YAML → Pydantic → Jinja2 → Typst → PDF. Same pipeline shape as CVOps; we own our template because RenderCV's themes optimize for looks, not ATS constraints.
- **Resume-Matcher** (srbhr) — local keyword/vector matching resume vs JD. Reference for `match.py`; v1 here is exact-string on purpose.
- **OpenResume** (xitanggg) — single-column editor targeting Greenhouse/Lever parsing; its parser is a useful second opinion.
- **resume-as-code** (silverbeer), **ats-resume-agent** (NullSpace-BitCradle) — LLM-driven JD targeting with a zero-fabrication policy; CVOps makes that policy a lint rule instead of a prompt.
