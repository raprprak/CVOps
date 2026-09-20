"""Fold an imported draft into the master profile, additively.

Nothing already in master changes: ids, text and order stay put. A draft entity master already
has (same skill, role, project, degree, certification) is *matched* and contributes only what
master lacks; anything else gets a collision-free id and, for roles and education, is placed by
date. "Already has" means equal after whitespace/case normalisation -- a reworded bullet is kept
as a separate bullet for the user to prune, never silently merged.

The returned target selects exactly the draft's content by master ids, in the draft's order, so
the uploaded resume can be rebuilt from master with full provenance (no overrides).
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable
from typing import Any

from cvops.models.common import StrictModel, normalize_ws
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
from cvops.models.target import EducationSelection, ExperienceSelection, ProjectSelection, Target


class MergeReport(StrictModel):
    added: dict[str, int]
    already_present: dict[str, int]


class Merged(StrictModel):
    master: Master
    target: Target
    report: MergeReport


def _norm(text: str) -> str:
    return normalize_ws(text).lower().rstrip(".")


def _same(a: str, b: str) -> bool:
    """Equal, or one contains the other ('Acme' vs 'Acme Corporation')."""
    x, y = _norm(a), _norm(b)
    return bool(x and y) and (x == y or x in y or y in x)


def _place(items: list[Any], new: Any, key: Callable[[Any], str]) -> None:
    """Insert `new` into a newest-first list ahead of the first older entry, else at the end."""
    k = key(new)
    for i, x in enumerate(items):
        if key(x) < k:
            items.insert(i, new)
            return
    items.append(new)


class _Merge:
    def __init__(self, master: Master) -> None:
        self.out = master.model_copy(deep=True)
        self.taken = set(self.out.index())
        self.added: Counter[str] = Counter()
        self.present: Counter[str] = Counter()

    def fresh(self, base: str) -> str:
        uid, n = base, 1
        while uid in self.taken:
            n += 1
            uid = f"{base}-{n}"
        self.taken.add(uid)
        return uid

    def bullets(self, parent_id: str, existing: list[Bullet], incoming: list[Bullet]) -> list[str]:
        """Append the incoming bullets `existing` lacks; return master ids for all of them."""
        by_text = {_norm(b.text): b.id for b in existing}
        ids: list[str] = []
        for b in incoming:
            key = _norm(b.text)
            if key in by_text:
                self.present["bullets"] += 1
            else:
                new = Bullet(
                    id=self.fresh(f"{parent_id}-{len(existing) + 1:02d}"),
                    text=b.text,
                    tags=b.tags,
                    metric=b.metric,
                )
                existing.append(new)
                by_text[key] = new.id
                self.added["bullets"] += 1
            ids.append(by_text[key])
        return ids


def _extend(selection: dict[str, list[str]], ref: str, ids: list[str]) -> None:
    selection[ref] = [*dict.fromkeys([*selection.get(ref, []), *ids])]


def merge(master: Master, draft: Master, *, max_pages: int = 2) -> Merged:
    m = _Merge(master)
    out = m.out

    summary_id: str | None = None
    if draft.summaries:
        s = draft.summaries[0]  # a target prints one summary
        hit = next((x for x in out.summaries if _norm(x.text) == _norm(s.text)), None)
        if hit is None:
            hit = TextBlock(id=m.fresh(s.id), text=s.text, tags=s.tags)
            out.summaries.append(hit)
            m.added["summaries"] += 1
        else:
            m.present["summaries"] += 1
        summary_id = hit.id

    known_urls = {link.url.lower().rstrip("/") for link in out.basics.links}
    for link in draft.basics.links:
        if link.url.lower().rstrip("/") not in known_urls:
            out.basics.links.append(link)
            m.added["links"] += 1

    known_skills: dict[str, str] = {}
    for sk in out.skills:
        known_skills[_norm(sk.name)] = sk.id
        known_skills.update({_norm(a): sk.id for a in sk.aliases})
    skill_ids: list[str] = []
    for sk in draft.skills:
        sid = known_skills.get(_norm(sk.name))
        if sid is None:
            new = Skill(
                id=m.fresh(sk.id),
                name=sk.name,
                category=sk.category,
                tags=sk.tags,
                aliases=sk.aliases,
            )
            out.skills.append(new)
            known_skills[_norm(sk.name)] = sid = new.id
            m.added["skills"] += 1
        else:
            m.present["skills"] += 1
        if sid not in skill_ids:
            skill_ids.append(sid)

    exp_sel: dict[str, list[str]] = {}
    for e in draft.experience:
        role = next(
            (x for x in out.experience if x.start == e.start and _same(x.company, e.company)),
            None,
        )
        if role is None:
            role = Experience(
                id=m.fresh(e.id),
                company=e.company,
                title=e.title,
                location=e.location,
                start=e.start,
                end=e.end,
            )
            _place(out.experience, role, lambda x: f"{x.end or '9999-99'} {x.start}")
            m.added["roles"] += 1
        else:
            m.present["roles"] += 1
        _extend(exp_sel, role.id, m.bullets(role.id, role.bullets, e.bullets))

    proj_sel: dict[str, list[str]] = {}
    for p in draft.projects:
        proj = next((x for x in out.projects if _norm(x.name) == _norm(p.name)), None)
        if proj is None:
            proj = Project(
                id=m.fresh(p.id),
                name=p.name,
                url=p.url,
                start=p.start,
                end=p.end,
            )
            out.projects.append(proj)
            m.added["projects"] += 1
        else:
            m.present["projects"] += 1
        _extend(proj_sel, proj.id, m.bullets(proj.id, proj.bullets, p.bullets))

    edu_sel: dict[str, list[str]] = {}
    for ed in draft.education:
        edu = next(
            (
                x
                for x in out.education
                if _same(x.institution, ed.institution) and _same(x.degree, ed.degree)
            ),
            None,
        )
        if edu is None:
            edu = Education(
                id=m.fresh(ed.id),
                institution=ed.institution,
                degree=ed.degree,
                field=ed.field,
                location=ed.location,
                start=ed.start,
                end=ed.end,
            )
            _place(out.education, edu, lambda x: x.end or x.start or "")
            m.added["education"] += 1
        else:
            m.present["education"] += 1
        _extend(edu_sel, edu.id, m.bullets(edu.id, edu.details, ed.details))

    cert_ids: list[str] = []
    for c in draft.certifications:
        cert = next((x for x in out.certifications if _norm(x.name) == _norm(c.name)), None)
        if cert is None:
            cert = Certification(
                id=m.fresh(c.id),
                name=c.name,
                issuer=c.issuer,
                date=c.date,
                url=c.url,
            )
            out.certifications.append(cert)
            m.added["certifications"] += 1
        else:
            m.present["certifications"] += 1
        if cert.id not in cert_ids:
            cert_ids.append(cert.id)

    target = Target(
        max_pages=max_pages,
        summary=summary_id,
        skills=skill_ids,
        experience=[ExperienceSelection(ref=k, bullets=v) for k, v in exp_sel.items()],
        projects=[ProjectSelection(ref=k, bullets=v) for k, v in proj_sel.items()],
        education=[EducationSelection(ref=k, details=v) for k, v in edu_sel.items()],
        certifications=cert_ids,
    )
    return Merged(
        master=out,
        target=target,
        report=MergeReport(added=dict(m.added), already_present=dict(m.present)),
    )
