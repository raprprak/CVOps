"""The ``cvops`` command line. Argument handling and printing only; the work is in services/."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Annotated, NoReturn

import typer

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
from cvops.services.render import PDF_STANDARDS, RenderError, compile_pdf, render_typ
from cvops.services.resolve import ResolveError, resolve

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
