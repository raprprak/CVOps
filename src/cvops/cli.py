"""The ``cvops`` command line. Argument handling and printing only; the work is in services/."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Annotated, NoReturn

import typer
import yaml

from cvops.core.files import (
    DataError,
    list_target_slugs,
    load_master,
    load_target,
    master_path,
    target_path,
)
from cvops.models.resolved import ResolvedResume
from cvops.services import ats_lint
from cvops.services.match import Status
from cvops.services.match import match as run_match
from cvops.services.render import PDF_STANDARDS, RenderError, compile_pdf, render_typ
from cvops.services.resolve import ResolveError, resolve
from cvops.services.tailor import tailor as tailor_target

app = typer.Typer(
    help="Resume-as-code: compile, lint and JD-match ATS-safe resumes from YAML.",
    no_args_is_help=True,
    add_completion=False,
)

DataDir = Annotated[
    Path, typer.Option("--data-dir", help="Directory holding master.yaml, targets/, jds/")
]
OutDir = Annotated[Path, typer.Option("--out-dir", help="Where compiled PDFs are written")]
SlugArg = Annotated[str | None, typer.Argument(help="Target slug: data/targets/<slug>.yaml")]
AllOpt = Annotated[bool, typer.Option("--all", help="Every target under data/targets/")]


def _fail(message: str) -> NoReturn:
    typer.echo(f"error: {message}", err=True)
    raise typer.Exit(code=1)


def _slugs(slug: str | None, all_targets: bool, data_dir: Path) -> list[str]:
    if all_targets and slug:
        _fail("give either a slug or --all, not both")
    if all_targets:
        slugs = list_target_slugs(data_dir)
        if not slugs:
            _fail(f"no targets found under {data_dir / 'targets'}")
        return slugs
    if not slug:
        _fail("give a target slug or --all")
    return [slug]


def _resolve_slug(slug: str, data_dir: Path) -> ResolvedResume:
    try:
        master = load_master(master_path(data_dir))
        target = load_target(target_path(data_dir, slug))
        return resolve(master, target, slug=slug)
    except (DataError, ResolveError) as exc:
        _fail(str(exc))


def _compile_one(
    name: str, data_dir: Path, out_dir: Path, standards: tuple[str, ...]
) -> tuple[ResolvedResume, bytes]:
    resume = _resolve_slug(name, data_dir)
    source = render_typ(resume)
    out_dir.mkdir(parents=True, exist_ok=True)
    typ_path = out_dir / f"{name}.typ"
    typ_path.write_text(source, encoding="utf-8")
    try:
        pdf = compile_pdf(source, standards=standards)
    except RenderError as exc:
        _fail(f"{name}: typst failed (source kept at {typ_path}):\n{exc}")
    (out_dir / f"{name}.pdf").write_bytes(pdf)
    return resume, pdf


@app.command()
def build(
    slug: SlugArg = None,
    all_targets: AllOpt = False,
    data_dir: DataDir = Path("data"),
    out_dir: OutDir = Path("out"),
    ua: Annotated[bool, typer.Option("--ua/--no-ua", help="Export as PDF/UA-1")] = True,
) -> None:
    """Compile one target (or all) to out/<slug>.pdf; the Typst source is kept beside it."""
    standards = PDF_STANDARDS if ua else ()
    for name in _slugs(slug, all_targets, data_dir):
        _, pdf = _compile_one(name, data_dir, out_dir, standards)
        typer.echo(f"built {out_dir / f'{name}.pdf'} ({len(pdf):,} bytes)")


@app.command()
def lint(
    slug: SlugArg = None,
    all_targets: AllOpt = False,
    data_dir: DataDir = Path("data"),
    out_dir: OutDir = Path("out"),
    ua: Annotated[bool, typer.Option("--ua/--no-ua", help="Export as PDF/UA-1")] = True,
) -> None:
    """Build one target (or all) and run the ATS lint rules (L1-L10) against the PDF.

    Exits non-zero if any target has an error-level finding -- this is what CI runs.
    """
    standards = PDF_STANDARDS if ua else ()
    had_errors = False
    for name in _slugs(slug, all_targets, data_dir):
        resume, pdf = _compile_one(name, data_dir, out_dir, standards)
        result = ats_lint.lint(resume, pdf)
        for finding in result.findings:
            marker = "error" if finding.level == "error" else "warn "
            typer.echo(f"{name}: [{marker}][{finding.rule}] {finding.message}")
        status = "FAIL" if not result.ok else "ok"
        typer.echo(
            f"{name}: {status} ({len(result.errors)} error(s), {len(result.warnings)} warning(s))"
        )
        had_errors = had_errors or not result.ok
    if had_errors:
        raise typer.Exit(code=1)


_STATUS_LABEL = {
    Status.PRESENT: "present",
    Status.PRESENT_AS_ALIAS: "present (alias)",
    Status.MISSING_FROM_TARGET: "missing from target",
    Status.MISSING: "missing",
}


def _read_jd(jd_path_arg: str, data_dir: Path) -> tuple[str, str]:
    """Try `data_dir/jd_path_arg` first, then `jd_path_arg` as given. Returns
    `(text, path_as_recorded)`, where the recorded path is relative to `data_dir` when
    the JD was found there (so it round-trips into `Target.jd` the way other targets
    reference their JDs), else the path as given."""
    under_data = data_dir / jd_path_arg
    if under_data.is_file():
        return under_data.read_text(encoding="utf-8"), jd_path_arg
    direct = Path(jd_path_arg)
    if direct.is_file():
        return direct.read_text(encoding="utf-8"), jd_path_arg
    _fail(f"job description not found: tried {under_data} and {direct}")


@app.command()
def match(
    slug: Annotated[str, typer.Argument(help="Target slug: data/targets/<slug>.yaml")],
    data_dir: DataDir = Path("data"),
    jd: Annotated[
        str | None, typer.Option(help="JD path, overriding the target's own `jd:` field")
    ] = None,
) -> None:
    """Score a target's keyword coverage against its job description."""
    master = load_master(master_path(data_dir))
    target = load_target(target_path(data_dir, slug))
    resume = resolve(master, target, slug=slug)
    jd_arg = jd or target.jd
    if not jd_arg:
        _fail(f"{slug} has no `jd:` field and no --jd was given")
    jd_text, _ = _read_jd(jd_arg, data_dir)
    report = run_match(resume, jd_text, master)

    for status in (
        Status.MISSING,
        Status.MISSING_FROM_TARGET,
        Status.PRESENT_AS_ALIAS,
        Status.PRESENT,
    ):
        lines = report.by_status(status)
        if not lines:
            continue
        typer.echo(f"-- {_STATUS_LABEL[status]} ({len(lines)}) --")
        for line in sorted(lines, key=lambda ln: -ln.candidate.weight):
            suffix = f"  [{line.note}]" if line.note else ""
            typer.echo(f"  [{line.candidate.section:>8}] {line.candidate.term}{suffix}")
    typer.echo(f"\nscore: {report.score:.0%}")


@app.command()
def tailor(
    jd_path: Annotated[str, typer.Argument(help="JD file, relative to --data-dir or as given")],
    new_slug: Annotated[str, typer.Argument(help="Slug to write: data/targets/<new-slug>.yaml")],
    data_dir: DataDir = Path("data"),
    max_pages: Annotated[int, typer.Option(help="max_pages for the proposed target")] = 1,
    force: Annotated[bool, typer.Option(help="Overwrite an existing target file")] = False,
) -> None:
    """Propose a target from master.yaml + a JD: selection and ordering only, nothing
    rewritten. Review the diff before committing -- this never writes an override."""
    out_path = target_path(data_dir, new_slug)
    if out_path.exists() and not force:
        _fail(f"{out_path} already exists (pass --force to overwrite)")
    master = load_master(master_path(data_dir))
    jd_text, recorded_jd_path = _read_jd(jd_path, data_dir)
    proposed = tailor_target(master, jd_text, jd_path=recorded_jd_path, max_pages=max_pages)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    data = proposed.model_dump(mode="json", exclude_none=True)
    out_path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")
    typer.echo(
        f"wrote {out_path} -- review it, then `cvops build {new_slug}` and `cvops lint {new_slug}`"
    )


@app.command()
def show(slug: SlugArg = None, data_dir: DataDir = Path("data")) -> None:
    """Print the resolved resume (what the template will print) as JSON."""
    if not slug:
        _fail("give a target slug")
    resume = _resolve_slug(slug, data_dir)
    json.dump(resume.model_dump(mode="json"), sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    app()
