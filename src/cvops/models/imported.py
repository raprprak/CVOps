"""An imported resume: a parsed draft that is NOT master data until it is reviewed and applied."""

from __future__ import annotations

from typing import Any

from pydantic import Field

from cvops.models.common import StrictModel


class ImportDraft(StrictModel):
    id: str
    filename: str  # the uploaded name, display only -- never used as a path
    imported_at: str  # ISO-8601 UTC
    applied_at: str | None = None  # set once the draft has been merged into master
    warnings: list[str] = Field(default_factory=list)  # where the parser doubts itself
    problems: list[str] = Field(default_factory=list)  # Master-schema violations still to fix
    # Master-shaped but lax: a parse can miss a required field (email, phone) that Master
    # would reject outright. It is validated against Master when applied, never before.
    master: dict[str, Any]
