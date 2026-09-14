# CVOps — Project Plan

_Status: v1.1, 2026-09-15 — P0 complete. Provisional by design — every decision below carries the condition that would reopen it._

## Thesis

CVOps exists to raise the probability that a given application produces an interview call. The popular "75% of resumes are auto-rejected by ATS" figure has no study behind it (it traces to a 2012 vendor pitch); the major ATSes don't auto-reject, and humans review nearly all applications. What actually loses the call is (1) resume fields not populating cleanly in the ATS database, so a recruiter's keyword *search* never surfaces you, and (2) weak keyword and relevance alignment with the job description.

So the pipeline has two load-bearing pillars, and everything else is polish:

- **Parse fidelity** — the compiled document must extract into clean, ordered, correctly-labelled text. This is deterministic and fully testable.
- **Keyword coverage** — the tailored resume must contain the JD's exact strings where they are true. This is measurable per target.

CVOps treats these as a CI pipeline treats code: the master data is the source, `build` compiles it, `lint` is the test suite, `match` is the coverage report, and git is the history.

## Decisions (running list)

| # | Decision | Why | Reopen if |
|---|----------|-----|-----------|
| 01 | Personal tool, N=1. CLI-first. | The value is the pipeline; a UI solves a problem we don't have. | It becomes something others use. |
| 02 | Renderer: **Typst** via `typst-py`, not LaTeX/tectonic. | Typst 0.14+ emits tagged PDFs by default (opt-in PDF/UA-1), compiles in milliseconds, one dependency, no `glyphtounicode` workaround needed. RenderCV made the same move for the same reasons. | A LaTeX template investment we want to keep, or a Typst limitation we hit in the single-column template. |
| 03 | Data model: **master + targets**. Master is the superset (every role, every bullet, each with a stable ID and keyword tags). A target is a *selection and ordering over master IDs* for one JD, not a rewrite. | Makes "zero fabrication" a lint rule (every output bullet must trace to a master ID) instead of a prompt instruction; makes tailoring a reviewable git diff. | A real need for free-form per-target prose that can't be expressed as selection + explicitly marked overrides. |
| 04 | Own ~100-line single-column Typst template; keep the Pydantic → Jinja2 → template → PDF shape. Not RenderCV as a library. | RenderCV's themes optimize for looks; we need to *enforce* ATS layout rules in the template. Small enough to own. | Template work balloons past a few hundred lines. |
| 05 | No database. YAML in git is the store. (Carried from scaffold.) | N=1; git *is* the version history the project is named after. | See 01. |
| 06 | Frontend parked (scaffold stays in the repo, gets no work); the FastAPI stub and its deps were removed in P0 rather than carried dead. | See 01. Re-enter via a thin API over the same library if a UI is ever wanted. | See 01. |
| 07 | JSON Resume is an import/export format, not the internal model. | It lacks IDs and tags, which 03 depends on. | Never — cheap either way. |

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

- **L1 Round-trip** (error): every leaf string in the resolved resume appears in the extracted text, normalized for whitespace — checked with two independent extractors (`pdftotext` and `pypdf`) so a single extractor's quirk can't mask a failure. This is the automated notepad test.
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

`match` extracts keyword candidates from the JD: n-grams matched against `skills.yaml` (canonical + aliases), plus tech-looking tokens (CamelCase, dotted names, version numbers), minus a stoplist. It reports three buckets: **present** (exact string in the resolved resume), **present as alias** (you wrote "Postgres", JD says "PostgreSQL" — switch to the JD's form, since recruiter search is exact-string), and **missing** (in the JD, nowhere in master — a real gap, or something to add to master if true). Score is weighted coverage, with JD "requirements" sections weighted above "nice to have". No embeddings in v1: exact matching is both simpler and aligned with how recruiter search actually works.

`tailor` takes master + JD and writes a *proposed* target file: selects roles and bullets whose tags cover the JD's keywords, orders Skills to lead with JD terms, and stops. You review the diff and commit. LLM-assisted bullet rewriting is deferred to P4 and, when it arrives, can only produce `overrides` — which L9 flags — so it can never fabricate silently.

## Phases

**P0 — Decide and align (now).** Confirm decisions 02–04. Update `CLAUDE.md` and `.claude/rules/{backend,ats-compliance}.md` to say Typst instead of tectonic/LaTeX. Add deps: `typst` (the `typst-py` binding — `compile()` takes `pdf_standards=["ua-1"]` and a fixed `timestamp`, which is what makes builds byte-reproducible; verify `uv add typst` works on your Mac, as PyPI wasn't reachable from the planning sandbox), `typer`, `pdfplumber`. Flatten to `src/cvops` if we take that reversible call. Done when the repo's own instructions match this plan and a hello-world `.typ` compiles through `typst-py`.

**P1 — Build.** Pydantic models for master/target, `resolve.py`, the single-column Typst template, `cvops build --target <slug>` and `--all`. Populate `data/master.yaml` with your real career data — the pipeline is only proven on real data. Done when a real target compiles to a one-page PDF that passes the manual notepad test.

**P2 — Lint and CI.** L1–L9 as pure functions with unit tests, including a fixture template that deliberately breaks L3 to prove the linter catches it. GitHub Actions: install uv + poppler, build every target, run lint, upload PDFs as artifacts, fail on any error. Done when CI is green on main and red on the broken fixture.

**P3 — Match and tailor.** `skills.yaml`, `match.py`, coverage report in the terminal, `tailor.py` writing a proposed target. Done when `cvops match` on a real JD shows correct present/alias/missing buckets and `cvops tailor` output passes lint unchanged.

**P4 — Deferred, in likely order.** `cvops watch` (rebuild on save; a PDF viewer is the UI). DOCX target from the same `ResolvedResume` — only when a real portal rejects or mangles the PDF. LLM-assisted rewriting behind the provenance gate. Thin FastAPI over the library, then the UI, only if decision 01 changes.

## Ground truth

Lint proves the PDF is *parseable*; only real portals prove it *parses the way they parse*. Keep a short log at `docs/ats-field-tests.md`: upload the compiled PDF to LinkedIn's resume import, a Workday "autofill with resume" flow, and a Greenhouse application, and record which fields populated correctly. Any field that fails becomes a new lint rule or template fix. This is the feedback loop the whole project is named after.

## Open threads

- DOCX: needed for "any portal in the world"? Unknown until a portal rejects the PDF. Deferred, but `ResolvedResume` is designed so a second renderer is cheap.
- `skills.yaml` scope: hand-curated for your domain vs. seeded from a public taxonomy. Start hand-curated; it's your data.
- Whether `match` should score against the master (what you *could* claim) as well as the target (what you *did* claim). Probably both — the delta is exactly what `tailor` should surface.

## What this plan is not

Not a product, not multi-user, not a resume-writing AI. It is a compiler, a linter and a coverage tool for one person's career data, with git as the history. Scope grows only when a real failure demands it.
