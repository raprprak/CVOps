"""Thin FastAPI wrapper over cvops.services -- no business logic lives here.

Every endpoint calls the same functions `cli.py` calls, in the same order. If a rule
about the data (schema, provenance, zero fabrication) needs to change, it changes in
`services/`, once, for both the CLI and this API.

Run with: uv run uvicorn cvops.api.app:app --reload --port 8000
"""

from __future__ import annotations

import re
import secrets
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from cvops.core.files import (
    DataError,
    import_files,
    imports_dir,
    list_imports,
    list_target_slugs,
    load_import,
    load_master,
    load_target,
    master_path,
    save_import,
    target_path,
    write_draft,
)
from cvops.core.masterfile import save_master
from cvops.models.common import ID_PATTERN
from cvops.models.imported import ImportDraft
from cvops.models.master import Master
from cvops.models.resolved import ResolvedResume
from cvops.services import ats_lint
from cvops.services.importer import ImportFailure, check, extract_text, parse
from cvops.services.match import Status
from cvops.services.match import match as run_match
from cvops.services.merge import merge
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


class MasterStats(BaseModel):
    name: str
    roles: int
    projects: int
    bullets: int
    skills: int
    education: int
    certifications: int


class TargetInfo(BaseModel):
    slug: str
    valid: bool = True
    problem: str | None = None  # why the target doesn't resolve against master
    max_pages: int = 0
    bullets: int = 0
    skills: int = 0
    version: str | None = None  # "v<commits touching the file> · <short sha>"; None = uncommitted
    updated: str | None = None  # ISO date of the last commit that touched the target file
    built_at: str | None = None  # ISO mtime of out/<slug>.pdf
    pdf_bytes: int | None = None


class Overview(BaseModel):
    master: MasterStats
    targets: list[TargetInfo]


def _git_version(path: Path) -> tuple[str | None, str | None]:
    """(version label, last-commit ISO date) from git history; (None, None) if unavailable."""
    try:
        log = subprocess.run(
            ["git", "log", "--format=%h %cI", "--", str(path)],
            capture_output=True,
            text=True,
            timeout=5,
            check=True,
        ).stdout.splitlines()
    except (OSError, subprocess.SubprocessError):
        return None, None
    if not log:
        return None, None
    sha, date = log[0].split(" ", 1)
    return f"v{len(log)} · {sha}", date


@app.get("/overview")
def overview() -> Overview:
    """Read-only summary for the landing dashboard: master stats + one row per target.

    Resolves each target (pure, no PDF work) so a broken one shows up here; lint needs a
    built PDF, so it stays on the per-target build endpoint.
    """
    try:
        master = load_master(master_path(DATA_DIR))
    except DataError as exc:
        raise HTTPException(404, str(exc)) from exc
    # Distinct master entities the existing resumes use -- master itself only grows, so its own
    # counts would not move when a version is deleted.
    used: dict[str, set[str]] = {k: set() for k in MasterStats.model_fields if k != "name"}
    targets: list[TargetInfo] = []
    for slug in list_target_slugs(DATA_DIR):
        path = target_path(DATA_DIR, slug)
        info = TargetInfo(slug=slug)
        info.version, info.updated = _git_version(path)
        pdf = OUT_DIR / f"{slug}.pdf"
        if pdf.is_file():
            st = pdf.stat()
            info.pdf_bytes = st.st_size
            info.built_at = datetime.fromtimestamp(st.st_mtime, UTC).isoformat()
        try:
            resume = resolve(master, load_target(path), slug=slug)
        except DataError as exc:
            info.valid, info.problem = False, str(exc)
        except ResolveError as exc:
            info.valid, info.problem = False, "; ".join(exc.problems)
        else:
            info.max_pages = resume.max_pages
            info.skills = len(resume.skills)
            info.bullets = sum(1 for _ in resume.text_items()) - (resume.summary is not None)
            used["roles"] |= {e.id for e in resume.experience}
            used["projects"] |= {p.id for p in resume.projects}
            used["skills"] |= {s.id for s in resume.skills}
            used["education"] |= {e.id for e in resume.education}
            used["certifications"] |= {c.id for c in resume.certifications}
            summary_id = {resume.summary.id} if resume.summary else set()
            used["bullets"] |= {t.id for t in resume.text_items()} - summary_id
        targets.append(info)
    stats = MasterStats(name=master.basics.name, **{k: len(v) for k, v in used.items()})
    return Overview(master=stats, targets=targets)


# -- imports: uploaded resumes parsed into drafts (never straight into master.yaml) --------

MAX_UPLOAD = 5 * 1024 * 1024
# extension -> (magic bytes the content must start with, kind for the parser)
_UPLOAD_KINDS = {".pdf": (b"%PDF-", "pdf"), ".docx": (b"PK", "docx")}


class ImportSummary(BaseModel):
    id: str
    filename: str
    imported_at: str
    applied_at: str | None
    name: str
    roles: int
    bullets: int
    skills: int
    projects: int
    education: int
    certifications: int
    warnings: list[str]
    problems: list[str]


def _import_summary(draft: ImportDraft) -> ImportSummary:
    m = draft.master
    roles, projects = m.get("experience", []), m.get("projects", [])
    return ImportSummary(
        id=draft.id,
        filename=draft.filename,
        imported_at=draft.imported_at,
        applied_at=draft.applied_at,
        name=m.get("basics", {}).get("name", ""),
        roles=len(roles),
        bullets=sum(len(x.get("bullets", [])) for x in [*roles, *projects]),
        skills=len(m.get("skills", [])),
        projects=len(projects),
        education=len(m.get("education", [])),
        certifications=len(m.get("certifications", [])),
        warnings=draft.warnings,
        problems=draft.problems,
    )


@app.get("/imports")
def get_imports() -> list[ImportSummary]:
    return [_import_summary(d) for d in list_imports(DATA_DIR)]


def _draft(import_id: str) -> ImportDraft:
    try:
        return load_import(DATA_DIR, import_id)
    except DataError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.get("/imports/{import_id}")
def get_import(import_id: str) -> ImportDraft:
    return _draft(import_id)


class DraftUpdate(BaseModel):
    master: dict[str, Any]


@app.put("/imports/{import_id}")
def update_import(import_id: str, body: DraftUpdate) -> ImportDraft:
    """Save edits to a draft. Anything is accepted; `problems` reports what Master would reject."""
    draft = _draft(import_id)
    draft.master = body.master
    draft.problems = check(body.master)
    write_draft(DATA_DIR, draft)
    return draft


@app.delete("/imports/{import_id}")
def delete_import(import_id: str) -> dict[str, list[str]]:
    """Move a draft and its uploaded file to data/.trash/<stamp>/ (recoverable).

    Master and any resume already made from the draft are untouched.
    """
    try:
        files = import_files(DATA_DIR, import_id)
    except DataError as exc:
        raise HTTPException(404, str(exc)) from exc
    if not files:
        raise HTTPException(404, f"no draft {import_id!r}")
    return {"moved": _trash(files)}


class NewDraft(BaseModel):
    master: dict[str, Any]
    name: str = Field(default="Resume builder", max_length=200)  # shown in the drafts list


@app.post("/imports/draft")
def create_draft(body: NewDraft) -> ImportDraft:
    """A draft made in the browser builder, with no uploaded file.

    Same lifecycle as an upload: `problems` lists what Master would reject, and nothing reaches
    master.yaml except through /apply.
    """
    draft = ImportDraft(
        id=secrets.token_hex(6),
        filename=body.name,
        imported_at=datetime.now(UTC).isoformat(timespec="seconds"),
        problems=check(body.master),
        master=body.master,
    )
    write_draft(DATA_DIR, draft)
    return draft


class ApplyRequest(BaseModel):
    slug: str = Field(pattern=ID_PATTERN)  # the new target; becomes a filename
    max_pages: int = Field(default=2, ge=1)


class ApplyResult(BaseModel):
    slug: str
    added: dict[str, int]
    already_present: dict[str, int]


@app.post("/imports/{import_id}/apply")
def apply_import(import_id: str, req: ApplyRequest) -> ApplyResult:
    """Merge a reviewed draft into master.yaml and write a target that selects exactly it.

    Everything is checked before anything is written: the draft must satisfy Master, the merged
    target must resolve, and the patched master.yaml is verified inside `save_master`.
    """
    draft = _draft(import_id)
    t_path = target_path(DATA_DIR, req.slug)
    if t_path.exists():
        raise HTTPException(409, f"{t_path} already exists; choose another slug")
    problems = check(draft.master)
    if problems:
        raise HTTPException(422, "fix these first:\n" + "\n".join(problems))
    try:
        master = load_master(master_path(DATA_DIR))
    except DataError as exc:
        raise HTTPException(404, str(exc)) from exc
    merged = merge(master, Master.model_validate(draft.master), max_pages=req.max_pages)
    try:
        resolve(merged.master, merged.target, slug=req.slug)
        save_master(master_path(DATA_DIR), master, merged.master, imports_dir(DATA_DIR) / "backups")
    except ResolveError as exc:
        raise HTTPException(422, "\n".join(exc.problems)) from exc
    except DataError as exc:
        raise HTTPException(500, str(exc)) from exc
    t_path.parent.mkdir(parents=True, exist_ok=True)
    data = merged.target.model_dump(mode="json", exclude_none=True)
    t_path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")
    draft.applied_at = datetime.now(UTC).isoformat(timespec="seconds")
    write_draft(DATA_DIR, draft)
    return ApplyResult(
        slug=req.slug,
        added=merged.report.added,
        already_present=merged.report.already_present,
    )


@app.post("/imports")
def upload_resume(file: UploadFile) -> ImportSummary:
    name = file.filename or "resume"
    ext = Path(name).suffix.lower()
    if ext not in _UPLOAD_KINDS:
        raise HTTPException(415, "only .pdf and .docx files are supported")
    data = file.file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, f"file is larger than {MAX_UPLOAD // (1024 * 1024)} MB")
    magic, kind = _UPLOAD_KINDS[ext]
    if not data.startswith(magic):
        raise HTTPException(415, f"not a valid {ext} file")
    try:
        text, notes = extract_text(data, kind)
    except ImportFailure as exc:
        raise HTTPException(422, str(exc)) from exc
    if not text.strip():
        raise HTTPException(422, "no extractable text (a scanned image? OCR is not supported)")
    parsed = parse(text)
    draft = ImportDraft(
        id=secrets.token_hex(6),
        filename=name[:200],
        imported_at=datetime.now(UTC).isoformat(timespec="seconds"),
        warnings=[*notes, *parsed.warnings],
        problems=check(parsed.master),
        master=parsed.master,
    )
    save_import(DATA_DIR, draft, data, ext)
    return _import_summary(draft)


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


def _trash(paths: list[Path]) -> list[str]:
    """Move the files that exist to data/.trash/<stamp>/ -- recoverable, never unlinked."""
    trash = DATA_DIR / ".trash" / datetime.now(UTC).strftime("%Y%m%dT%H%M%S")
    trash.mkdir(parents=True, exist_ok=True)
    moved: list[str] = []
    for p in paths:
        if p.is_file():
            shutil.move(p, trash / p.name)
            moved.append(p.name)
    return moved


class DeleteResult(BaseModel):
    moved: list[str]
    overview: Overview  # the dashboard as it is now, so the UI needs no second request


@app.delete("/targets/{slug}")
def delete_target(slug: str) -> DeleteResult:
    """Move a target and its build output to data/.trash/<stamp>/ -- recoverable, not unlinked.

    Master and the import it came from are untouched, so the version can be rebuilt.
    """
    src = target_path(DATA_DIR, slug)
    if not re.fullmatch(ID_PATTERN, slug) or not src.is_file():
        raise HTTPException(404, f"no target {slug!r}")
    moved = _trash([src, OUT_DIR / f"{slug}.pdf", OUT_DIR / f"{slug}.typ"])
    return DeleteResult(moved=moved, overview=overview())


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
        MatchLine(
            section=ln.candidate.section, term=ln.candidate.term, status=status.value, note=ln.note
        )
        for status in _MATCH_ORDER
        for ln in sorted(report.by_status(status), key=lambda x: -x.candidate.weight)
    ]
    return MatchResult(score=report.score, lines=lines)


class TailorRequest(BaseModel):
    jd_text: str
    new_slug: str = Field(pattern=ID_PATTERN)  # becomes a filename: no '/' or '..'
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
