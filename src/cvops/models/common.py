"""Shared model base class and value types used across master, target and resolved models."""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, ConfigDict, StringConstraints

ID_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
YEAR_MONTH_PATTERN = r"^\d{4}-(?:0[1-9]|1[0-2])$"

_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

# Typographic en dash — used verbatim in dates and never produced via Typst's `--` shorthand,
# so the extracted text of a compiled PDF matches the resolved strings byte for byte.
EN_DASH = "–"


class StrictModel(BaseModel):
    """Base for every schema: unknown keys are errors, strings are stripped."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _coerce_year_month(value: Any) -> Any:
    # PyYAML turns an unquoted `2022-04-01` into a date; `2022-04` stays a string.
    if isinstance(value, dt.datetime | dt.date):
        return f"{value.year:04d}-{value.month:02d}"
    return value


Id = Annotated[str, StringConstraints(pattern=ID_PATTERN)]
YearMonth = Annotated[
    str,
    BeforeValidator(_coerce_year_month),
    StringConstraints(pattern=YEAR_MONTH_PATTERN),
]


def format_year_month(value: str) -> str:
    """'2022-04' -> 'Apr 2022'."""
    year, month = value.split("-")
    return f"{_MONTHS[int(month) - 1]} {year}"


def format_date_range(
    start: str | None, end: str | None, *, present: str = "Present"
) -> str | None:
    """Format a start/end pair the way the template prints it. `end=None` means ongoing."""
    if start is None:
        return format_year_month(end) if end else None
    tail = format_year_month(end) if end else present
    return f"{format_year_month(start)} {EN_DASH} {tail}"


def normalize_ws(text: str) -> str:
    """Collapse all internal whitespace to single spaces (also used by the linter)."""
    return " ".join(text.split())
