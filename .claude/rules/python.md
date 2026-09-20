# Python rules

## Tooling
- Package manager: **uv** only — never pip/poetry directly. `uv add <pkg>`, `uv add --dev <pkg>`, `uv sync`, `uv run <cmd>`.
- Linter/formatter: **ruff** (`uv run ruff check .`, `uv run ruff format .`). Config lives in `pyproject.toml`.
- Python 3.12+, src layout at repo root (`src/cvops/`), installed editable via `uv sync`. The CLI entry point is `cvops` (`[project.scripts]`).
- Tests: pytest under `tests/`, mirroring the `src/cvops/` structure. Fixtures under `tests/fixtures/`.

## Structure
- `src/cvops/cli.py` — Typer app. Argument parsing and printing only; every command delegates to `services/`.
- `src/cvops/models/` — Pydantic v2 schemas. `master.py` is the canonical shape of career data; `target.py` is a selection/ordering over master IDs; YAML under `data/` must validate against these.
- `src/cvops/services/` — the pipeline: `resolve.py` (target ∘ master → `ResolvedResume`), `render.py` (Jinja2 → Typst → PDF), `ats_lint.py` (rules L1–L10), `match.py` (JD coverage), `tailor.py` (proposes a target).
- `src/cvops/templates/resume/` — Jinja2 templates that emit Typst source (`*.typ.j2`).
- `src/cvops/core/` — config, paths, shared utilities. `files.py` loads/locates data and stores import drafts; `masterfile.py` patches `master.yaml` in place (ruamel.yaml, comments preserved, verified before replacing).
- `src/cvops/services/importer.py` (offline heuristic resume parser -> draft), `merge.py` (additive, idempotent merge of a draft into master) and `models/imported.py` (`ImportDraft`).
- `src/cvops/api/app.py` — thin FastAPI wrapper over `services/` for the web app (decision 06). Endpoints call the same functions the CLI does; no business logic here.

## Conventions
- Type-hint everything; Pydantic v2 models at every boundary, not raw dicts.
- Keep `services/` pure and testable: no filesystem or CLI concerns inside the pipeline functions beyond what they're handed.
- Provenance is structural: `render.py` only ever receives a `ResolvedResume`, and every bullet in it carries the master ID it came from. Text that did not pass through `resolve.py` must not reach a template.
- Rendering: escape every user-supplied string for Typst before interpolating into `.typ` (`#`, `*`, `_`, `` ` ``, `<`, `>`, `@`, `\`, `$`, `[`, `]`, `{`, `}` are all markup in Typst). Jinja2 autoescape is HTML-oriented and does not cover this — use the explicit `typst_escape` filter.
- Compile with `typst.compile(..., pdf_standards=["ua-1"])` and a fixed `timestamp` so builds are byte-reproducible.
- ATS linting and JD matching are a test suite for a resume, not application glue: each rule/scorer is a pure function over `(ResolvedResume, pdf_bytes)` or `(ResolvedResume, JobDescription)`.
- Don't add a database. Filesystem YAML + git is the source of truth by design (decision 05 in `docs/PLAN.md`).
- The API stays a thin wrapper: validate input at the boundary (ids match `ID_PATTERN` before they become filenames, uploads are size/extension/magic-byte checked), call `services/`, return models. Anything that writes `master.yaml` goes through `merge` + `save_master`, never a plain dump.
- Personal data stays out of git: `data/master.yaml`, `data/imports/`, `data/.trash/` are gitignored; tests use fake data.
