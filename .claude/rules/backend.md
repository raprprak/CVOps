# Backend rules (Python / FastAPI)

## Tooling
- Package manager: **uv** only — never pip/poetry directly. `uv add <pkg>`, `uv add --dev <pkg>`, `uv sync`, `uv run <cmd>`.
- Linter/formatter: **ruff** (`uv run ruff check .`, `uv run ruff format .`). Config lives in `backend/pyproject.toml`.
- Python 3.12+, src layout (`backend/src/cvops/`), installed editable via `uv sync`.
- Tests: pytest under `backend/tests/`, mirroring the `src/cvops/` structure.

## Structure
- `src/cvops/api/` — FastAPI routers only. No business logic here — delegate to `services/`.
- `src/cvops/models/` — Pydantic schemas. This is the canonical shape of career data; YAML files in `data/profiles/` must validate against these.
- `src/cvops/services/` — the compile/lint/match pipeline logic (`render.py`, `ats_lint.py`, `match.py`).
- `src/cvops/core/` — config, shared utilities.

## Conventions
- Type-hint everything; Pydantic v2 models at every boundary, not raw dicts.
- Keep `services/` pure/testable — the compile pipeline should be unit-testable without spinning up FastAPI.
- LaTeX rendering: Jinja2 templates in `src/cvops/templates/resume/`. Escape all user-supplied strings before interpolating into `.tex` — LaTeX special characters are an injection vector into the compiled document.
- ATS-linting and JD-matching logic should be independently testable — treat them like a test suite for a resume, not application glue code.
- Don't add a database. Filesystem YAML + git is the source of truth by design; revisit only if real multi-user auth becomes a requirement.

## Local requirements
- `tectonic` (LaTeX engine) is not yet installed on this machine — install via `brew install tectonic` before implementing the render pipeline.
