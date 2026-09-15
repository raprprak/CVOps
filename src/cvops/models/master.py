"""The master profile: the superset of everything true about one person's career.

Every entity that a target can select carries a stable ``id``. IDs are the provenance
mechanism — a target references them, the resolver copies text through by ID, and the
linter rejects any rendered text that does not trace back to one.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from pydantic import Field, field_validator, model_validator

from cvops.models.common import Id, StrictModel, YearMonth, normalize_ws


class Link(StrictModel):
    label: str = Field(min_length=1)  # "GitHub", "LinkedIn", "Portfolio"
    url: str = Field(min_length=1)


class Basics(StrictModel):
    name: str = Field(min_length=1)
    email: str = Field(min_length=1)
    phone: str = Field(min_length=1)
    location: str | None = None
    links: list[Link] = Field(default_factory=list)


class TextBlock(StrictModel):
    """A unit of prose with an ID: a summary paragraph or a bullet."""

    id: Id
    text: str = Field(min_length=1)
    tags: list[str] = Field(default_factory=list)

    @field_validator("text")
    @classmethod
    def _single_line(cls, value: str) -> str:
        # A folded/literal YAML scalar may carry newlines; the template prints one line.
        return normalize_ws(value)


class Bullet(TextBlock):
    metric: bool | None = None  # explicit intent; the linter infers from the text when None


class Skill(StrictModel):
    id: Id
    name: str = Field(min_length=1)
    category: str | None = None  # "Languages", "Backend", ... groups the Skills section
    tags: list[str] = Field(default_factory=list)


class Experience(StrictModel):
    id: Id
    company: str = Field(min_length=1)
    title: str = Field(min_length=1)
    location: str | None = None
    start: YearMonth
    end: YearMonth | None = None  # None = present
    bullets: list[Bullet] = Field(default_factory=list)


class Project(StrictModel):
    id: Id
    name: str = Field(min_length=1)
    url: str | None = None
    start: YearMonth | None = None
    end: YearMonth | None = None
    bullets: list[Bullet] = Field(default_factory=list)


class Education(StrictModel):
    id: Id
    institution: str = Field(min_length=1)
    degree: str = Field(min_length=1)
    field: str | None = None
    location: str | None = None
    start: YearMonth | None = None
    end: YearMonth | None = None
    details: list[Bullet] = Field(default_factory=list)


class Certification(StrictModel):
    id: Id
    name: str = Field(min_length=1)
    issuer: str | None = None
    date: YearMonth | None = None
    url: str | None = None


class Master(StrictModel):
    basics: Basics
    summaries: list[TextBlock] = Field(default_factory=list)
    skills: list[Skill] = Field(default_factory=list)
    experience: list[Experience] = Field(default_factory=list)
    projects: list[Project] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    certifications: list[Certification] = Field(default_factory=list)

    def iter_entities(self) -> Iterator[tuple[str, Any]]:
        """Yield ``(kind, entity)`` for everything that has an ID, in document order."""
        for block in self.summaries:
            yield "summary", block
        for skill in self.skills:
            yield "skill", skill
        for exp in self.experience:
            yield "experience", exp
            for bullet in exp.bullets:
                yield "bullet", bullet
        for project in self.projects:
            yield "project", project
            for bullet in project.bullets:
                yield "bullet", bullet
        for edu in self.education:
            yield "education", edu
            for detail in edu.details:
                yield "bullet", detail
        for cert in self.certifications:
            yield "certification", cert

    def index(self) -> dict[str, tuple[str, Any]]:
        """Map every ID to ``(kind, entity)``."""
        return {entity.id: (kind, entity) for kind, entity in self.iter_entities()}

    @model_validator(mode="after")
    def _ids_are_unique(self) -> Master:
        seen: dict[str, str] = {}
        for kind, entity in self.iter_entities():
            if entity.id in seen:
                raise ValueError(
                    f"duplicate id {entity.id!r} (used by a {seen[entity.id]} and a {kind})"
                )
            seen[entity.id] = kind
        return self
