"""Propose a target from master + a JD. Selection and ordering only -- never rewrites
text. This is what makes CVOps's "zero fabrication" policy structural rather than a
prompt instruction: the output is a `Target`, and everything a `Target` can do is pick
and order `Master` ids (`.claude/rules/ats-compliance.md`). The result is meant to be
reviewed as a git diff and committed, not used unread.
"""

from __future__ import annotations

from cvops.models.master import Bullet, Master
from cvops.models.target import (
    DEFAULT_SECTIONS,
    EducationSelection,
    ExperienceSelection,
    ProjectSelection,
    Target,
)
from cvops.services.match import Status, extract_candidates


def _relevant_keywords(master: Master, jd_text: str) -> set[str]:
    """Lowercased strings a bullet's `tags` should be compared against: every JD token
    CVOps recognized as a candidate, plus the canonical name of every master skill that
    candidate resolved to (so a bullet tagged "fastapi" matches a JD that says
    "FastAPI" even though the token itself was consumed as a skill match, not a bare
    heuristic token -- see match.extract_candidates)."""
    keywords: set[str] = set()
    for candidate in extract_candidates(jd_text, master):
        keywords.add(candidate.term.lower())
        if candidate.matched_via:
            keywords.add(candidate.matched_via.lower())
    return keywords


def _bullet_score(bullet: Bullet, keywords: set[str]) -> int:
    return len({tag.lower() for tag in bullet.tags} & keywords)


def _select_bullets(bullets: list[Bullet], keywords: set[str]) -> list[str] | None:
    """`None` (= every master bullet) when nothing scores, else the scoring ones,
    highest first, ties broken by master order."""
    scored = [(b, _bullet_score(b, keywords)) for b in bullets]
    hits = [b for b, score in scored if score > 0]
    if not hits:
        return None
    hits.sort(key=lambda b: next(s for bb, s in scored if bb is b), reverse=True)
    return [b.id for b in hits]


def tailor(
    master: Master,
    jd_text: str,
    *,
    jd_path: str | None = None,
    max_pages: int = 1,
    skills_heading: str = "Technical Skills",
) -> Target:
    keywords = _relevant_keywords(master, jd_text)
    matched_skill_ids = {
        c.skill_id for c in extract_candidates(jd_text, master) if c.skill_id is not None
    }

    # Skills: matched-to-the-JD skills first (master order among themselves), then
    # everything else you know, so nothing you claimed is silently dropped -- only
    # reordered to put what the JD asked for first (.claude/rules/ats-compliance.md).
    matched_skills = [s.id for s in master.skills if s.id in matched_skill_ids]
    other_skills = [s.id for s in master.skills if s.id not in matched_skill_ids]
    skills = [*matched_skills, *other_skills]

    experience = [
        ExperienceSelection(ref=exp.id, bullets=_select_bullets(exp.bullets, keywords))
        for exp in master.experience
    ]

    projects = [
        ProjectSelection(ref=project.id, bullets=_select_bullets(project.bullets, keywords))
        for project in master.projects
        if any(_bullet_score(b, keywords) > 0 for b in project.bullets)
    ]

    education = [
        EducationSelection(ref=edu.id, details=None)  # keep every detail; JD rarely trims this
        for edu in master.education
    ]

    return Target(
        jd=jd_path,
        max_pages=max_pages,
        skills_heading=skills_heading,
        sections=list(DEFAULT_SECTIONS),
        summary=master.summaries[0].id if master.summaries else None,
        skills=skills,
        experience=experience,
        projects=projects,
        education=education,
        certifications=[c.id for c in master.certifications],
        overrides=[],
    )


__all__ = ["Status", "tailor"]
