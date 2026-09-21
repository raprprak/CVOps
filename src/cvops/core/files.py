"""Loading YAML data files into validated models, and locating targets on disk."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml
from pydantic import ValidationError

from cvops.models.imported import ImportDraft
from cvops.models.master import Master
from cvops.models.target import Target


class DataError(ValueError):
    """A data file is missing, malformed, or fails schema validation."""


def load_yaml(path: Path) -> Any:
    if not path.is_file():
        raise DataError(f"{path}: file not found")
    try:
        with path.open(encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
    except yaml.YAMLError as exc:
        raise DataError(f"{path}: invalid YAML: {exc}") from exc
    return {} if data is None else data


def _format_validation_error(exc: ValidationError) -> str:
    lines = []
    for err in exc.errors():
        loc = ".".join(str(part) for part in err["loc"]) or "<root>"
        lines.append(f"{loc}: {err['msg']}")
    return "\n  - ".join(lines)


def load_master(path: Path) -> Master:
    try:
        return Master.model_validate(load_yaml(path))
    except ValidationError as exc:
        raise DataError(
            f"{path}: invalid master profile:\n  - {_format_validation_error(exc)}"
        ) from exc


def load_target(path: Path) -> Target:
    try:
        return Target.model_validate(load_yaml(path))
    except ValidationError as exc:
        raise DataError(f"{path}: invalid target:\n  - {_format_validation_error(exc)}") from exc


def master_path(data_dir: Path) -> Path:
    return data_dir / "master.yaml"


def target_path(data_dir: Path, slug: str) -> Path:
    return data_dir / "targets" / f"{slug}.yaml"


def list_target_slugs(data_dir: Path) -> list[str]:
    targets_dir = data_dir / "targets"
    if not targets_dir.is_dir():
        return []
    return sorted(p.stem for p in targets_dir.glob("*.yaml"))


def imports_dir(data_dir: Path) -> Path:
    return data_dir / "imports"


def write_draft(data_dir: Path, draft: ImportDraft) -> None:
    folder = imports_dir(data_dir)
    folder.mkdir(parents=True, exist_ok=True)
    dumped = yaml.safe_dump(draft.model_dump(mode="json"), sort_keys=False, allow_unicode=True)
    (folder / f"{draft.id}.yaml").write_text(dumped, encoding="utf-8")


def save_import(data_dir: Path, draft: ImportDraft, original: bytes, ext: str) -> None:
    """Write the draft and the uploaded original side by side, both named by the generated id."""
    write_draft(data_dir, draft)
    (imports_dir(data_dir) / f"{draft.id}{ext}").write_bytes(original)


def load_import(data_dir: Path, import_id: str) -> ImportDraft:
    # The id becomes a filename, so only the exact shape we generate is accepted.
    if not re.fullmatch(r"[0-9a-f]{12}", import_id):
        raise DataError(f"invalid import id {import_id!r}")
    path = imports_dir(data_dir) / f"{import_id}.yaml"
    try:
        return ImportDraft.model_validate(load_yaml(path))
    except ValidationError as exc:
        raise DataError(f"{path}: invalid draft:\n  - {_format_validation_error(exc)}") from exc


def import_files(data_dir: Path, import_id: str) -> list[Path]:
    """The draft and the uploaded original for one import id (empty if there are none)."""
    if not re.fullmatch(r"[0-9a-f]{12}", import_id):
        raise DataError(f"invalid import id {import_id!r}")
    return sorted(p for p in imports_dir(data_dir).glob(f"{import_id}.*") if p.is_file())


def list_imports(data_dir: Path) -> list[ImportDraft]:
    """Saved import drafts, newest first; an unreadable draft is skipped, not fatal."""
    drafts: list[ImportDraft] = []
    for path in imports_dir(data_dir).glob("*.yaml"):
        try:
            drafts.append(ImportDraft.model_validate(load_yaml(path)))
        except (DataError, ValidationError):
            continue
    return sorted(drafts, key=lambda d: d.imported_at, reverse=True)
