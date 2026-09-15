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
        resume = _resolve_slug(name, data_dir)
        source = render_typ(resume)
        out_dir.mkdir(parents=True, exist_ok=True)
        typ_path = out_dir / f"{name}.typ"
        typ_path.write_text(source, encoding="utf-8")
        try:
            pdf = compile_pdf(source, standards=standards)
        except RenderError as exc:
            _fail(f"{name}: typst failed (source kept at {typ_path}):\n{exc}")
        pdf_path = out_dir / f"{name}.pdf"
        pdf_path.write_bytes(pdf)
        typer.echo(f"built {pdf_path} ({len(pdf):,} bytes)")


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
