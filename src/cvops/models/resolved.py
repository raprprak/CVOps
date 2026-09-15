"""The resolved resume: exactly what gets rendered, with provenance on every line of text.

``resolve.py`` is the only producer. ``render.py`` is the main consumer; the linter uses
``reading_order()`` as the ground truth for what the compiled PDF must contain, in order.
The template must print strings in the same order ``reading_order()`` yields them.
"""

from __future__ import annotations

from collections.abc import Iterator

from pydantic import Field

from cvops.models.common import StrictModel
from cvops.models.master import Basics
from cvops.models.target import SectionName

SECTION_HEADINGS: dict[str, str] = {
    "summary": "Summary",
    "experience": "Experience",
    "projects": "Projects",
    "education": "Education",
    "certifications": "Certifications",
}


class ResolvedText(StrictModel):
    id: str
    text: str
    tags: list[str] = Field(default_factory=list)
    overridden: bool = False
    metric: bool | None = None


class ResolvedSkill(StrictModel):
    id: str
    name: str
    category: str | None = None


class ResolvedExperience(StrictModel):
    id: str
    company: str
    title: str
    location: str | None = None
    dates: str
    bullets: list[ResolvedText] = Field(default_factory=list)


class ResolvedProject(StrictModel):
    id: str
    name: str
    url: str | None = None
    dates: str | None = None
    bullets: list[ResolvedText] = Field(default_factory=list)


class ResolvedEducation(StrictModel):
    id: str
    institution: str
    degree: str
    field: str | None = None
    location: str | None = None
    dates: str | None = None
    details: list[ResolvedText] = Field(default_factory=list)


class ResolvedCertification(StrictModel):
    id: str
    name: str
    issuer: str | None = None
    date: str | None = None
    url: str | None = None


class SkillGroup(StrictModel):
    label: str | None = None
    skills: list[ResolvedSkill]


class ResolvedResume(StrictModel):
    slug: str
    basics: Basics
    sections: list[SectionName]  # only non-empty sections, in print order
    skills_heading: str
    max_pages: int
    paper: str
    template: str
    summary: ResolvedText | None = None
    skills: list[ResolvedSkill] = Field(default_factory=list)
    experience: list[ResolvedExperience] = Field(default_factory=list)
    projects: list[ResolvedProject] = Field(default_factory=list)
    education: list[ResolvedEducation] = Field(default_factory=list)
    certifications: list[ResolvedCertification] = Field(default_factory=list)

    def heading(self, section: str) -> str:
        return self.skills_heading if section == "skills" else SECTION_HEADINGS[section]

    def contact_items(self) -> list[str]:
        """The labelled contact strings printed under the name, in order."""
        items = [f"Email: {self.basics.email}", f"Phone: {self.basics.phone}"]
        if self.basics.location:
            items.append(f"Location: {self.basics.location}")
        items.extend(f"{link.label}: {link.url}" for link in self.basics.links)
        return items

    def skill_groups(self) -> list[SkillGroup]:
        """Skills grouped by category in first-seen order; a single unlabelled group if none."""
        if not any(skill.category for skill in self.skills):
            return [SkillGroup(label=None, skills=list(self.skills))] if self.skills else []
        groups: dict[str | None, list[ResolvedSkill]] = {}
        for skill in self.skills:
            groups.setdefault(skill.category, []).append(skill)
        return [SkillGroup(label=label, skills=skills) for label, skills in groups.items()]

    def text_items(self) -> Iterator[ResolvedText]:
        """Every unit of prose with provenance: summary, bullets, education details."""
        if self.summary is not None:
            yield self.summary
        for exp in self.experience:
            yield from exp.bullets
        for project in self.projects:
            yield from project.bullets
        for edu in self.education:
            yield from edu.details

    def reading_order(self) -> list[str]:
        """Every visible string, in the order the template prints them."""
        out: list[str] = [self.basics.name, *self.contact_items()]
        for section in self.sections:
            out.append(self.heading(section))
            if section == "summary" and self.summary is not None:
                out.append(self.summary.text)
            elif section == "skills":
                for group in self.skill_groups():
                    if group.label:
                        out.append(f"{group.label}:")
                    out.extend(skill.name for skill in group.skills)
            elif section == "experience":
                for exp in self.experience:
                    out.extend([exp.title, exp.company])
                    if exp.location:
                        out.append(exp.location)
                    out.append(exp.dates)
                    out.extend(b.text for b in exp.bullets)
            elif section == "projects":
                for project in self.projects:
                    out.append(project.name)
                    if project.url:
                        out.append(project.url)
                    if project.dates:
                        out.append(project.dates)
                    out.extend(b.text for b in project.bullets)
            elif section == "education":
                for edu in self.education:
                    out.append(edu.degree)
                    if edu.field:
                        out.append(edu.field)
                    out.append(edu.institution)
                    if edu.location:
                        out.append(edu.location)
                    if edu.dates:
                        out.append(edu.dates)
                    out.extend(d.text for d in edu.details)
            elif section == "certifications":
                for cert in self.certifications:
                    out.append(cert.name)
                    if cert.issuer:
                        out.append(cert.issuer)
                    if cert.date:
                        out.append(cert.date)
        return out
