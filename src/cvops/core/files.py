"""Loading YAML data files into validated models, and locating targets on disk."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pydantic import ValidationError

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
