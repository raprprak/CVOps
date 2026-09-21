# CVOps — Project Plan

_Status: v1.5, 2026-09-21 — P0-P3 implemented; P4 (API + web app: import, review/edit, merge, builder, dashboard) built at Ravi's explicit request, reopening decision 01/06. Everything the assistant could not run before now has been run on the developer's machine and passes (see P4). `docs/ats-field-tests.md` scaffolded, still empty. Provisional by design — every decision below carries the condition that would reopen it._

## Thesis

CVOps exists to raise the probability that a given application produces an interview call. The popular "75% of resumes are auto-rejected by ATS" figure has no study behind it (it traces to a 2012 vendor pitch); the major ATSes don't auto-reject, and humans review nearly all applications. What actually loses the call is (1) resume fields not populating cleanly in the ATS database, so a recruiter's keyword *search* never surfaces you, and (2) weak keyword and relevance alignment with the job description.

So the pipeline has two load-bearing pillars, and everything else is polish:

- **Parse fidelity** — the compiled document must extract into clean, ordered, correctly-labelled text. This is deterministic and fully testable.
- **Keyword coverage** — the tailored resume must contain the JD's exact strings where they are true. This is measurable per target.

CVOps treats these as a CI pipeline treats code: the master data is the source, `build` compiles it, `lint` is the test suite, `match` is the coverage report, and git is the history.

## Decisions (running list)

| # | Decision | Why | Reopen if |
|---|----------|-----|-----------|
| 01 | Personal tool, N=1. CLI-first, **plus a thin API + UI as of 2026-09-20** (reopened -- see 06). | The value is the pipeline; a UI solves a problem we don't have -- turned out not to matter, Ravi wanted one anyway. | Multi-user or a real deployment target would matter more now. |
| 02 | Renderer: **Typst** via `typst-py`, not LaTeX/tectonic. | Typst 0.14+ emits tagged PDFs by default (opt-in PDF/UA-1), compiles in milliseconds, one dependency, no `glyphtounicode` workaround needed. RenderCV made the same move for the same reasons. | A LaTeX template investment we want to keep, or a Typst limitation we hit in the single-column template. |
| 03 | Data model: **master + targets**. Master is the superset (every role, every bullet, each with a stable ID and keyword tags). A target is a *selection and ordering over master IDs* for one JD, not a rewrite. | Makes "zero fabrication" a lint rule (every output bullet must trace to a master ID) instead of a prompt instruction; makes tailoring a reviewable git diff. | A real need for free-form per-target prose that can't be expressed as selection + explicitly marked overrides. |
| 04 | Own ~100-line single-column Typst template; keep the Pydantic → Jinja2 → template → PDF shape. Not RenderCV as a library. | RenderCV's themes optimize for looks; we need to *enforce* ATS layout rules in the template. Small enough to own. | Template work balloons past a few hundred lines. |
| 05 | No database. YAML is the store. Targets live in git; **`data/master.yaml` is gitignored** (see 08). | N=1; git is the version history for everything that can be public. | See 01. |
| 06 | **Reopened 2026-09-20.** `src/cvops/api/app.py`: thin FastAPI wrapping the exact `services/` calls the CLI makes, no logic duplicated. `frontend/`: Next.js 16 web app -- an app shell around the dashboard, a "New resume" choice (upload or build), review/edit, the builder, and "Tailor to a job" (match, tailor, build & check), laid out as a three-step workflow. Design: Glassmorphism, dark (`design-system/`); animation building blocks in `frontend/src/lib/fx/`. Dependencies added since the first cut: `motion` (animation) and `three` (lazy-loaded, one particle effect). | Ravi asked for it directly -- see 01. | Auth, multi-user, or a deploy target would need real design work; today it's `localhost:8000` <-> `localhost:3000`, one person, one machine. |
| 07 | JSON Resume is an import/export format, not the internal model. | It lacks IDs and tags, which 03 depends on. | Never — cheap either way. |
| 08 | **`data/master.yaml`, `data/imports/` and `data/.trash/` are gitignored** (2026-09-21). | The repo is public and master holds contact details. The safety net for master is the timestamped copy written to `data/imports/backups/` before every change, not git. `.gitleaks.toml` (secrets plus email/phone rules) runs as a pre-commit hook and a CI job. | The repo is made private for good, or master gets an encrypted store. |
| 09 | **Imports are drafts, applied by an additive merge.** An uploaded PDF/DOCX is parsed offline (heuristics, no LLM) into a draft; it reaches master only through `services/merge.py` (existing ids, text and order never change; idempotent) and `core/masterfile.py` (in-place ruamel.yaml patch that keeps master's comments and is verified before it replaces the file). Contact details are never changed by a merge. | Keeps 03's provenance (nothing enters master unreviewed) and makes a wrong parse cheap to discard. | Parsing quality needs an LLM, or master needs edits a merge cannot express. |
| 10 | **L3 ignores right-aligned dates; contact items never break inside a URL** (2026-09-21). | The first real run of `lint` showed L3 failing the author's own resumes: same-format dates are almost the same width, so they start at the same x on every entry and looked like a second column. And a long contact line could wrap inside a URL, which fails L1 and would split it for a parser. | A parser is found that misreads right-aligned dates. |

Cheap, reversible calls (picked and moved in P0): Python project flattened from `backend/` to the repo root (`src/cvops/`); CLI framework Typer; layout analysis via `pdfplumber`.

## Architecture

```
master.yaml  ──┐
               ├──► resolve (target ∘ master) ──► render (Typst) ──► out/<target>.pdf
targets/*.yaml ┘                                        │
                                                        ▼
jds/*.md ──────────────► match ◄──────────────── lint (extract + verify)
                           │
                           ▼
                     tailor ──► targets/<new>.yaml   (human reviews the diff)
```

Proposed layout:

```
src/cvops/
  cli.py                 # typer: build, lint, match, tailor, watch
  models/                # master.py, target.py, jd.py, skills.py (Pydantic v2)
  services/
    resolve.py           # target ∘ master → ResolvedResume (provenance kept)
    render.py            # Jinja2 → .typ → typst-py → PDF
    ats_lint.py          # rules L1–L10 below
    match.py             # JD keyword extraction + coverage
    tailor.py            # proposes a target from master + JD
  templates/resume/
    ats_single_column.typ.j2
data/
  master.yaml            # your real career data (the one source of truth)
  skills.yaml            # canonical skill names + aliases (PostgreSQL: [Postgres, psql])
  targets/<company-role>.yaml
  jds/<company-role>.md
out/                     # compiled PDFs, gitignored (CI uploads them as artifacts)
tests/                   # mirrors src/cvops; fixtures include a deliberately broken template
.github/workflows/ci.yml
```

## Data model sketch

```yaml
# data/master.yaml
basics: { name: ..., email: ..., phone: ..., location: ..., links: [...] }
skills:
  - id: sk-fastapi     # stable IDs never change once used by a target
    name: FastAPI
    tags: [python, backend, api]
experience:
  - id: exp-acme
    company: Acme
    title: Senior Engineer
    start: 2022-04
    end: null            # null = present; template decides how to print it
    bullets:
      - id: exp-acme-01
        text: "Cut p95 API latency 40% (measured by Datadog APM) by moving hot paths to FastAPI async handlers"
        tags: [fastapi, performance, python]
        metric: true     # lint warns on bullets with no number; this flag documents intent
```

```yaml
# data/targets/acme-backend.yaml
jd: jds/acme-backend.md
max_pages: 1
sections: [skills, experience, projects, education]     # order is a ranking lever
skills: [sk-fastapi, sk-postgresql, sk-docker]           # order = order printed
experience:
  - ref: exp-acme
    bullets: [exp-acme-01, exp-acme-03]                  # subset + order
  - ref: exp-prev
    bullets: [exp-prev-02]
overrides:                                               # the only place text can differ from master
  - ref: exp-acme-03
    text: "..."                                          # lint flags every override as a warning
```

Provenance is structural: `resolve.py` produces a `ResolvedResume` where every bullet carries its master ID, and `render.py` never sees text that didn't pass through it.

## Lint rules (the test suite for a resume)

Errors fail the build; warnings are reported. Each rule is a pure function over `(ResolvedResume, pdf_bytes)` and unit-tested in isolation.

- **L1 Round-trip** (error): every leaf string in the resolved resume appears in the extracted text, normalized for whitespace — checked with two independent extractors (`pdftotext` and `pdfplumber`) so a single extractor's quirk can't mask a failure. This is the automated notepad test.
- **L2 Reading order** (error): section headings and bullets appear in the extracted text in the same order as the source (monotonic index check).
- **L3 Single column** (error): via `pdfplumber`, all text lines start within one left-margin band; no two lines share a y-range with disjoint x-ranges. Catches any layout regression that would interleave text.
- **L4 Standard headings** (error): every top-level section title is in the dictionary {Summary, Experience, Education, Skills, Technical Skills, Projects, Certifications, Publications}.
- **L5 Contact as text** (error): email, phone and URLs are found by regex in the extracted text, each preceded by its literal label.
- **L6 Fonts** (error): all fonts embedded, every font has a ToUnicode CMap. Typst makes this always true; kept as a guard against template drift.
- **L7 No images or tables** (error): no image XObjects in the PDF; the template has no table constructs.
- **L8 Length** (error): page count ≤ `max_pages` from the target.
- **L9 Provenance** (error/warning): every rendered bullet resolves to a master ID (error); each override is reported (warning) so you consciously accept the drift from master.
- **L10 Content hygiene** (warning): bullets without a number; inconsistent date formats; a Skills section that isn't within the first N lines of extracted text.

## Match and tailor

`match` extracts keyword candidates from the JD: known master skill names/aliases (high-confidence), plus tech-looking tokens (CamelCase, dotted names, version numbers, acronyms) not yet in master, minus a stoplist. It reports four buckets: **present** (exact string in the resolved resume), **present as alias** (you wrote "Postgres", JD says "PostgreSQL" — switch to the JD's form, since recruiter search is exact-string), **missing from target** (a real master skill, just not selected into this target), and **missing** (in the JD, nowhere in master — a real gap, or something to add to master if true). Score is weighted coverage, with JD "requirements" sections weighted above "nice to have". No embeddings: exact matching is both simpler and aligned with how recruiter search actually works.

`tailor` takes master + JD and writes a *proposed* target file: selects roles and bullets whose tags cover the JD's keywords, orders Skills to lead with JD terms, and stops — it only ever selects/orders master ids, never writes an `override`. You review the diff and commit. LLM-assisted bullet rewriting is deferred and, when it arrives, can only produce `overrides` — which L9 flags — so it can never fabricate silently.

## Phases

**P0 — Decide and align. Done (2026-09-15).** Confirmed decisions 02–04. `CLAUDE.md` and `.claude/rules/{python,ats-compliance,context,frontend}.md` describe Typst, not tectonic/LaTeX. Flattened `backend/src/cvops` to `src/cvops` at the repo root.

**P1 — Build. Done (2026-09-15).** Pydantic models for master/target, `resolve.py`, the single-column Typst template, `cvops build`/`show`. Real career data populated into `data/master.yaml` on 2026-09-17 (see Status history) — no placeholder data remains.

**P2 — Lint and CI. Done (2026-09-15).** L1–L10 as pure functions with unit tests. GitHub Actions installs uv + poppler, builds every target, runs lint, uploads PDFs as artifacts, fails on any error.

**P3 — Match and tailor. Done (2026-09-15).** `services/match.py`, `services/tailor.py`, `cvops match`/`tailor`.

**P4 — Built (2026-09-20/21).** `src/cvops/api/app.py` + `frontend/` (decision 06), the import/merge flow (09), the builder, delete-with-trash, and a live dashboard. Verified on the developer's machine on 2026-09-21: `pytest` (50 pass), `ruff check` and `ruff format --check`, frontend `tsc --noEmit`, `eslint` and `next build`, and CI's `cvops build --all` / `lint --all` on `tests/fixtures`; UI checked in a real browser (Playwright) against mocked API responses. That first real lint run found the L3 and URL-wrap defects fixed in decision 10. CI builds `tests/fixtures` (`--data-dir`), because real data is not in git. Still deferred: `cvops watch`, a DOCX target, LLM-assisted rewriting behind the provenance gate. Known limits: the importer's heuristics were tuned on one resume; merge matches entities by normalised text only; the builder needs an existing `data/master.yaml`.

## Ground truth

Lint proves the PDF is *parseable*; only real portals prove it *parses the way they parse*. Keep a short log at `docs/ats-field-tests.md` (scaffolded 2026-09-17, still empty): upload the compiled PDF to LinkedIn's resume import, a Workday "autofill with resume" flow, and a Greenhouse application, and record which fields populated correctly. Any field that fails becomes a new lint rule or template fix. This is the feedback loop the whole project is named after.

## Open threads

- DOCX: needed for "any portal in the world"? Unknown until a portal rejects the PDF. Deferred, but `ResolvedResume` is designed so a second renderer is cheap.
- `skills.yaml` scope: skills currently live inline in `master.yaml` rather than a separate canonical-names-and-aliases file — revisit if alias management outgrows that.
- Whether `match` should score against the master (what you *could* claim) as well as the target (what you *did* claim). Probably both — the delta is exactly what `tailor` should surface.
- **New:** this document's own Architecture/Lint/Match sections above still described the pre-P0 plan in a few places (fixed the L1-extractor and match-bucket-count mismatches in this edit) rather than the as-built P1-P3 code — worth a dedicated pass to reconcile the whole document with `src/cvops/` once, rather than patching it phase by phase.

## What this plan is not

Not a product, not multi-user, not a resume-writing AI. It is a compiler, a linter and a coverage tool for one person's career data, with git as the history. Scope grows only when a real failure demands it.
