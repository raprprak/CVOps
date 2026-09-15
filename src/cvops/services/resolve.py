"""Resolve a target against the master profile into a ``ResolvedResume``.

This is the provenance boundary: every string that reaches the renderer passes through
here, and every bullet keeps the master ID it came from. All problems are collected and
raised together so one run of ``cvops build`` reports every broken reference.
"""

from __future__ import annotations

from cvops.models.common import format_date_range, format_year_month, normalize_ws
from cvops.models.master import (
    Bullet,
    Certification,
    Education,
    Experience,
    Master,
    Project,
    Skill,
    TextBlock,
)
from cvops.models.resolved import (
    ResolvedCertification,
    ResolvedEducation,
    ResolvedExperience,
    ResolvedProject,
    ResolvedResume,
    ResolvedSkill,
    ResolvedText,
)
from cvops.models.target import SectionName, Target


class ResolveError(ValueError):
    """One or more references in the target do not resolve against the master."""

    def __init__(self, problems: list[str]) -> None:
        self.problems = problems
        super().__init__("target does not resolve:\n  - " + "\n  - ".join(problems))


class _Resolver:
    def __init__(self, master: Master, target: Target, slug: str) -> None:
        self.master = master
        self.target = target
        self.slug = slug
        self.index = master.index()
        self.overrides = {o.ref: normalize_ws(o.text) for o in target.overrides}
        self.overrides_used: set[str] = set()
        self.problems: list[str] = []

    # -- helpers -----------------------------------------------------------------------

    def lookup(self, ref: str, kind: str, where: str) -> object | None:
        entry = self.index.get(ref)
        if entry is None:
            self.problems.append(f"{where}: unknown id {ref!r}")
            return None
        actual_kind, entity = entry
        if actual_kind != kind:
            self.problems.append(f"{where}: {ref!r} is a {actual_kind}, expected a {kind}")
            return None
        return entity

    def text(self, block: TextBlock) -> ResolvedText:
        overridden = block.id in self.overrides
        if overridden:
            self.overrides_used.add(block.id)
        return ResolvedText(
            id=block.id,
            text=self.overrides[block.id] if overridden else block.text,
            tags=list(block.tags),
            overridden=overridden,
            metric=block.metric if isinstance(block, Bullet) else None,
        )

    def pick_bullets(
        self, owner_id: str, available: list[Bullet], wanted: list[str] | None, where: str
    ) -> list[ResolvedText]:
        if wanted is None:
            return [self.text(b) for b in available]
        by_id = {b.id: b for b in available}
        chosen: list[ResolvedText] = []
        for ref in wanted:
            bullet = by_id.get(ref)
            if bullet is None:
                # A bullet that exists elsewhere in the master is still an error here:
                # attributing it to this entry would be a fabrication.
                hint = " (exists under another entry)" if ref in self.index else ""
                self.problems.append(f"{where}: {owner_id!r} has no bullet {ref!r}{hint}")
                continue
            chosen.append(self.text(bullet))
        return chosen

    # -- sections ----------------------------------------------------------------------

    def summary(self) -> ResolvedText | None:
        if self.target.summary is None:
            return None
        block = self.lookup(self.target.summary, "summary", "summary")
        return self.text(block) if isinstance(block, TextBlock) else None

    def skills(self) -> list[ResolvedSkill]:
        out: list[ResolvedSkill] = []
        for ref in self.target.skills:
            skill = self.lookup(ref, "skill", "skills")
            if isinstance(skill, Skill):
                out.append(ResolvedSkill(id=skill.id, name=skill.name, category=skill.category))
        return out

    def experience(self) -> list[ResolvedExperience]:
        out: list[ResolvedExperience] = []
        for sel in self.target.experience:
            exp = self.lookup(sel.ref, "experience", "experience")
            if not isinstance(exp, Experience):
                continue
            dates = format_date_range(exp.start, exp.end)
            assert dates is not None  # start is required on Experience
            out.append(
                ResolvedExperience(
                    id=exp.id,
                    company=exp.company,
                    title=exp.title,
                    location=exp.location,
                    dates=dates,
                    bullets=self.pick_bullets(exp.id, exp.bullets, sel.bullets, "experience"),
                )
            )
        return out

    def projects(self) -> list[ResolvedProject]:
        out: list[ResolvedProject] = []
        for sel in self.target.projects:
            project = self.lookup(sel.ref, "project", "projects")
            if not isinstance(project, Project):
                continue
            out.append(
                ResolvedProject(
                    id=project.id,
                    name=project.name,
                    url=project.url,
                    dates=format_date_range(project.start, project.end),
                    bullets=self.pick_bullets(project.id, project.bullets, sel.bullets, "projects"),
                )
            )
        return out

    def education(self) -> list[ResolvedEducation]:
        out: list[ResolvedEducation] = []
        for sel in self.target.education:
            edu = self.lookup(sel.ref, "education", "education")
            if not isinstance(edu, Education):
                continue
            out.append(
                ResolvedEducation(
                    id=edu.id,
                    institution=edu.institution,
                    degree=edu.degree,
                    field=edu.field,
                    location=edu.location,
                    dates=format_date_range(edu.start, edu.end),
                    details=self.pick_bullets(edu.id, edu.details, sel.details, "education"),
                )
            )
        return out

    def certifications(self) -> list[ResolvedCertification]:
        out: list[ResolvedCertification] = []
        for ref in self.target.certifications:
            cert = self.lookup(ref, "certification", "certifications")
            if isinstance(cert, Certification):
                out.append(
                    ResolvedCertification(
                        id=cert.id,
                        name=cert.name,
                        issuer=cert.issuer,
                        date=format_year_month(cert.date) if cert.date else None,
                        url=cert.url,
                    )
                )
        return out

    # -- entry point -------------------------------------------------------------------

    def run(self) -> ResolvedResume:
        summary = self.summary()
        skills = self.skills()
        experience = self.experience()
        projects = self.projects()
        education = self.education()
        certifications = self.certifications()

        for ref in self.overrides:
            if ref not in self.overrides_used:
                if ref not in self.index:
                    self.problems.append(f"overrides: unknown id {ref!r}")
                else:
                    self.problems.append(
                        f"overrides: {ref!r} is not selected by this target, so the "
                        "override would never print"
                    )

        if self.problems:
            raise ResolveError(self.problems)

        populated: dict[SectionName, bool] = {
            "summary": summary is not None,
            "skills": bool(skills),
            "experience": bool(experience),
            "projects": bool(projects),
            "education": bool(education),
            "certifications": bool(certifications),
        }
        sections = [s for s in self.target.sections if populated[s]]

        return ResolvedResume(
            slug=self.slug,
            basics=self.master.basics,
            sections=sections,
            skills_heading=self.target.skills_heading,
            max_pages=self.target.max_pages,
            paper=self.target.paper,
            template=self.target.template,
            summary=summary,
            skills=skills,
            experience=experience,
            projects=projects,
            education=education,
            certifications=certifications,
        )


def resolve(master: Master, target: Target, *, slug: str) -> ResolvedResume:
    """Apply ``target`` to ``master``. Raises ``ResolveError`` listing every bad reference."""
    return _Resolver(master, target, slug).run()
