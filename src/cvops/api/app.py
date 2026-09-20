"""Thin FastAPI wrapper over cvops.services -- no business logic lives here.

Every endpoint calls the same functions `cli.py` calls, in the same order. If a rule
about the data (schema, provenance, zero fabrication) needs to change, it changes in
`services/`, once, for both the CLI and this API.

Run with: uv run uvicorn cvops.api.app:app --reload --port 8000
"""

from __future__ import annotations

from pathlib import Path

import yaml
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from cvops.core.files import (
    DataError,
    list_target_slugs,
    load_master,
    load_target,
    master_path,
    target_path,
)
from cvops.models.master import Master
from cvops.models.resolved import ResolvedResume
from cvops.services import ats_lint
from cvops.services.match import Status
from cvops.services.match import match as run_match
from cvops.services.render import PDF_STANDARDS, RenderError, compile_pdf, render_typ
from cvops.services.resolve import ResolveError, resolve
from cvops.services.tailor import tailor as tailor_target

DATA_DIR = Path("data")
OUT_DIR = Path("out")

app = FastAPI(title="CVOps API")

# The frontend is a separate process (Next.js dev server on :3000); this is a personal,
# local-only tool (PLAN.md decision 01), so any localhost origin is fine -- there is no
# deployment story to lock this down for yet.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _resolved(slug: str) -> ResolvedResume:
    try:
        master = load_master(master_path(DATA_DIR))
        target = load_target(target_path(DATA_DIR, slug))
        return resolve(master, target, slug=slug)
    except DataError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ResolveError as exc:
        raise HTTPException(422, "\n".join(exc.problems)) from exc


@app.get("/targets")
def list_targets() -> list[str]:
    return list_target_slugs(DATA_DIR)


@app.get("/master")
def get_master() -> Master:
    try:
        return load_master(master_path(DATA_DIR))
    except DataError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.get("/targets/{slug}")
def get_target(slug: str) -> ResolvedResume:
    return _resolved(slug)


class BuildResult(BaseModel):
    slug: str
    pdf_bytes: int
    lint_ok: bool
    errors: list[str]
    warnings: list[str]


@app.post("/targets/{slug}/build")
def build_target(slug: str, ua: bool = True) -> BuildResult:
    resume = _resolved(slug)
    source = render_typ(resume)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / f"{slug}.typ").write_text(source, encoding="utf-8")
    try:
        pdf = compile_pdf(source, standards=PDF_STANDARDS if ua else ())
    except RenderError as exc:
        raise HTTPException(422, f"typst failed (source kept at {slug}.typ): {exc}") from exc
    (OUT_DIR / f"{slug}.pdf").write_bytes(pdf)
    result = ats_lint.lint(resume, pdf)
    return BuildResult(
        slug=slug,
        pdf_bytes=len(pdf),
        lint_ok=result.ok,
        errors=[f"[{f.rule}] {f.message}" for f in result.findings if f.level == "error"],
        warnings=[f"[{f.rule}] {f.message}" for f in result.findings if f.level == "warning"],
    )


@app.get("/targets/{slug}/pdf")
def get_pdf(slug: str) -> Response:
    pdf_path = OUT_DIR / f"{slug}.pdf"
    if not pdf_path.is_file():
        raise HTTPException(404, f"{slug}.pdf not built yet -- POST /targets/{slug}/build first")
    return Response(pdf_path.read_bytes(), media_type="application/pdf")


class MatchLine(BaseModel):
    section: str
    term: str
    status: str
    note: str = ""


class MatchResult(BaseModel):
    score: float
    lines: list[MatchLine]


# Worst-first, same order the CLI prints (cli.py `match`): a gap you should fix is more
# useful to see before a line confirming something already present.
_MATCH_ORDER = (Status.MISSING, Status.MISSING_FROM_TARGET, Status.PRESENT_AS_ALIAS, Status.PRESENT)


class MatchRequest(BaseModel):
    jd_text: str | None = None  # pasted directly -- takes priority when given
    jd_path: str | None = None  # explicit path override, e.g. "jds/acme.md"


@app.post("/targets/{slug}/match")
def match_target(slug: str, req: MatchRequest) -> MatchResult:
    master = load_master(master_path(DATA_DIR))
    try:
        target = load_target(target_path(DATA_DIR, slug))
    except DataError as exc:
        raise HTTPException(404, str(exc)) from exc
    resume = resolve(master, target, slug=slug)
    if req.jd_text:
        jd_text = req.jd_text
    else:
        jd_arg = req.jd_path or target.jd
        if not jd_arg:
            raise HTTPException(400, "no jd_text pasted, and target has no jd: field or jd_path")
        jd_path = DATA_DIR / jd_arg if (DATA_DIR / jd_arg).is_file() else Path(jd_arg)
        if not jd_path.is_file():
            raise HTTPException(404, f"job description not found: {jd_path}")
        jd_text = jd_path.read_text(encoding="utf-8")
    report = run_match(resume, jd_text, master)
    lines = [
        MatchLine(section=ln.candidate.section, term=ln.candidate.term, status=status.value, note=ln.note)
        for status in _MATCH_ORDER
        for ln in sorted(report.by_status(status), key=lambda l: -l.candidate.weight)
    ]
    return MatchResult(score=report.score, lines=lines)


class TailorRequest(BaseModel):
    jd_text: str
    new_slug: str
    max_pages: int = 1
    force: bool = False


class TailorResult(BaseModel):
    wrote: str


@app.post("/tailor")
def tailor_new_target(req: TailorRequest) -> TailorResult:
    out_path = target_path(DATA_DIR, req.new_slug)
    if out_path.exists() and not req.force:
        raise HTTPException(409, f"{out_path} already exists (pass force=true to overwrite)")
    try:
        master = load_master(master_path(DATA_DIR))
    except DataError as exc:
        raise HTTPException(404, str(exc)) from exc
    proposed = tailor_target(
        master, req.jd_text, jd_path=f"jds/{req.new_slug}.md", max_pages=req.max_pages
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    data = proposed.model_dump(mode="json", exclude_none=True)
    out_path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")
    return TailorResult(wrote=str(out_path))
