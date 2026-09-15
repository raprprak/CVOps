"""A target: one job's resume, expressed as a selection and ordering over master IDs.

A target never contains career facts of its own. The only place text can differ from the
master is ``overrides``, and every override is reported by the linter (rule L9) so the
drift is a conscious choice, not a silent rewrite.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator, model_validator

from cvops.models.common import Id, StrictModel

SectionName = Literal["summary", "skills", "experience", "projects", "education", "certifications"]
DEFAULT_SECTIONS: tuple[SectionName, ...] = (
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
    "certifications",
)


def _unique(values: list[str], what: str) -> list[str]:
    seen: set[str] = set()
    for value in values:
        if value in seen:
            raise ValueError(f"duplicate {what} {value!r}")
        seen.add(value)
    return values


class ExperienceSelection(StrictModel):
    ref: Id
    bullets: list[Id] | None = None  # None = every master bullet in master order; [] = none

    @field_validator("bullets")
    @classmethod
    def _unique_bullets(cls, value: list[str] | None) -> list[str] | None:
        return None if value is None else _unique(value, "bullet ref")


class ProjectSelection(StrictModel):
    ref: Id
    bullets: list[Id] | None = None

    @field_validator("bullets")
    @classmethod
    def _unique_bullets(cls, value: list[str] | None) -> list[str] | None:
        return None if value is None else _unique(value, "bullet ref")


class EducationSelection(StrictModel):
    ref: Id
    details: list[Id] | None = None

    @field_validator("details")
    @classmethod
    def _unique_details(cls, value: list[str] | None) -> list[str] | None:
        return None if value is None else _unique(value, "detail ref")


class Override(StrictModel):
    ref: Id
    text: str = Field(min_length=1)


class Target(StrictModel):
    jd: str | None = None  # path relative to the data dir, e.g. "jds/acme-backend.md"
    max_pages: int = Field(default=1, ge=1)
    paper: Literal["a4", "us-letter"] = "a4"
    template: str = "ats_single_column"
    skills_heading: Literal["Technical Skills", "Skills"] = "Technical Skills"
    sections: list[SectionName] = Field(default_factory=lambda: list(DEFAULT_SECTIONS))
    summary: Id | None = None
    skills: list[Id] = Field(default_factory=list)  # order here is the order printed
    experience: list[ExperienceSelection] = Field(default_factory=list)
    projects: list[ProjectSelection] = Field(default_factory=list)
    education: list[EducationSelection] = Field(default_factory=list)
    certifications: list[Id] = Field(default_factory=list)
    overrides: list[Override] = Field(default_factory=list)

    @field_validator("sections")
    @classmethod
    def _unique_sections(cls, value: list[SectionName]) -> list[SectionName]:
        _unique(list(value), "section")
        return value

    @field_validator("skills", "certifications")
    @classmethod
    def _unique_ids(cls, value: list[str]) -> list[str]:
        return _unique(value, "ref")

    @model_validator(mode="after")
    def _unique_selection_refs(self) -> Target:
        _unique([s.ref for s in self.experience], "experience ref")
        _unique([s.ref for s in self.projects], "project ref")
        _unique([s.ref for s in self.education], "education ref")
        _unique([o.ref for o in self.overrides], "override ref")
        return self
