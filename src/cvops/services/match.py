"""JD keyword coverage: does a resolved resume contain the strings a recruiter's exact-
string search would look for? No embeddings, on purpose (`.claude/rules/ats-compliance.md`
/ docs/PLAN.md): recruiter search matches literal strings, so scoring by literal presence
is both simpler and more faithful to what actually happens than a semantic-similarity
score would be.

Two kinds of candidate keyword come out of a JD:
  - "known" -- the JD's text contains a master skill's name or one of its aliases.
    These are high-confidence: they're already something you claim to know.
  - "heuristic" -- a tech-looking token (has a digit, internal capital, `+`/`#`/`.`/`/`,
    or is a short all-caps acronym) that doesn't match anything in master at all. These
    are candidates for "should I add this to master.yaml?", not proven claims.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum

from cvops.models.master import Master, Skill
from cvops.models.resolved import ResolvedResume

# -- JD structure: which lines are "required" vs "nice to have" ------------------------

_SECTION_WEIGHTS = {"required": 2.0, "general": 1.0, "preferred": 0.5}
_REQUIRED_HEADING_RE = re.compile(
    r"^\s{0,3}#{0,6}\s*(requirements?|required|must[\s-]?have|qualifications?|"
    r"you (have|bring)|minimum qualifications)\b.*:?\s*$",
    re.IGNORECASE,
)
_PREFERRED_HEADING_RE = re.compile(
    r"^\s{0,3}#{0,6}\s*(nice[\s-]?to[\s-]?have|preferred|bonus( points)?|pluses?|"
    r"good to have)\b.*:?\s*$",
    re.IGNORECASE,
)
_OTHER_HEADING_RE = re.compile(r"^\s{0,3}#{0,6}\s*[A-Z][\w /&-]{2,40}:?\s*$")


def _jd_sections(jd_text: str) -> list[tuple[str, str]]:
    """Split a JD into `(line, section)` pairs. A line's section is whichever heading
    last preceded it; any other heading-looking line resets back to "general"."""
    section = "general"
    out: list[tuple[str, str]] = []
    for line in jd_text.splitlines():
        if _REQUIRED_HEADING_RE.match(line):
            section = "required"
            continue
        if _PREFERRED_HEADING_RE.match(line):
            section = "preferred"
            continue
        if _OTHER_HEADING_RE.match(line):
            section = "general"
            continue
        out.append((line, section))
    return out


# -- candidate extraction ----------------------------------------------------------------

_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9+#./-]*")
_STOPWORDS = frozenset(
    """
    a an the and or but if then else for of to in on at by with from as is are was were
    be been being this that these those it its your you we our their they he she will
    would should could can may might must have has had do does did not no yes etc via
    into onto per about across after before during under over between within without
    role team work working experience years year strong excellent proven ability skills
    skill knowledge understanding familiarity including includes include using use used
    responsibilities requirements qualifications preferred required nice good great
    """.split()
)
_ACRONYM_RE = re.compile(r"^[A-Z]{2,6}$")
_SIMPLE_CAP_WORD_RE = re.compile(r"^[A-Z][a-z]{2,}$")
_YEARS_EXPERIENCE_RE = re.compile(r"^\d+\+$")  # "3+" (years) -- noise, not a skill


def _is_techy(token: str, *, is_first_token: bool = False) -> bool:
    if len(token) < 2 or token.lower() in _STOPWORDS:
        return False
    if token.isdigit() or _YEARS_EXPERIENCE_RE.match(token):
        return False
    if any(ch in token for ch in "+#./") and not token.strip("+#./-").isdigit():
        return True
    if any(ch.isdigit() for ch in token):
        return True
    if _ACRONYM_RE.match(token):
        return True
    if token[0].isupper() and any(ch.isupper() for ch in token[1:]):  # CamelCase / PostgreSQL
        return True
    if not is_first_token and _SIMPLE_CAP_WORD_RE.match(token):
        # A capitalized word that isn't the first word of its line/bullet is very often
        # a named tool/technology (Docker, Kubernetes, Django, ...) even with no other
        # signal. Sentence-initial capitals are excluded to avoid flagging every bullet's
        # first word; still noisy (place names, "English"), which is why this only ever
        # feeds a report a person reads, never an automatic addition to master.yaml.
        return True
    return False


@dataclass(frozen=True)
class Candidate:
    term: str  # exact string to look for (master skill's canonical name, or the JD token)
    section: str  # "required" | "preferred" | "general"
    weight: float
    skill_id: str | None = None  # set when this candidate is a known master skill
    matched_via: str | None = None  # the alias/spelling actually found in the JD, if not `term`


def _skill_lookup(master: Master) -> dict[str, Skill]:
    """Every (name, alias) spelling a skill can appear under, lowercased -> the skill."""
    table: dict[str, Skill] = {}
    for skill in master.skills:
        for spelling in (skill.name, *skill.aliases):
            table[spelling.lower()] = skill
    return table


def extract_candidates(jd_text: str, master: Master) -> list[Candidate]:
    # A term can be mentioned in more than one section (e.g. once in a general intro
    # blurb, again under "Requirements"); keep whichever mention has the *highest*
    # weight, since being explicitly called out as required is the stronger signal even
    # if the same word also appears in ordinary prose. `index[key]` is that term's
    # position in `candidates`, so a later, higher-weight mention updates in place
    # rather than appending a duplicate.
    index: dict[str, int] = {}
    candidates: list[Candidate] = []
    lookup = _skill_lookup(master)
    # Longer spellings first, so "Node.js" matches before a bare "Node" would.
    spellings = sorted(lookup, key=len, reverse=True)

    def _record(key: str, candidate: Candidate) -> None:
        if key in index:
            if candidate.weight > candidates[index[key]].weight:
                candidates[index[key]] = candidate
        else:
            index[key] = len(candidates)
            candidates.append(candidate)

    for line, section in _jd_sections(jd_text):
        weight = _SECTION_WEIGHTS[section]
        lower_line = line.lower()
        claimed_spans: list[tuple[int, int]] = []
        for spelling in spellings:
            start = 0
            while (idx := lower_line.find(spelling, start)) != -1:
                end = idx + len(spelling)
                start = end
                # word-boundary check so "go" doesn't match inside "going"
                before_ok = idx == 0 or not (lower_line[idx - 1].isalnum())
                after_ok = end == len(lower_line) or not (lower_line[end].isalnum())
                if not (before_ok and after_ok):
                    continue
                skill = lookup[spelling]
                _record(
                    skill.id,
                    Candidate(
                        term=skill.name,
                        section=section,
                        weight=weight,
                        skill_id=skill.id,
                        matched_via=line[idx:end],
                    ),
                )
                claimed_spans.append((idx, end))

        line_tokens = list(_TOKEN_RE.finditer(line))
        first_token_start = line_tokens[0].start() if line_tokens else None
        # A capitalized word gets the "sentence-initial, probably not a skill" pass only
        # when it's the first of *several* words -- a JD's most common skill-list shape
        # is one bare item per bullet ("- Docker"), where that single word obviously is
        # the point of the line, not a sentence opener like "Strong communication...".
        single_token_line = len(line_tokens) == 1
        for match in line_tokens:
            token = match.group(0)
            if any(a <= match.start() < b for a, b in claimed_spans):
                continue  # already counted as part of a known skill's spelling
            # A trailing sentence-final mark ("Docker." / "Kubernetes,") isn't part of a
            # tech name -- strip it before judging the token, so it doesn't wrongly look
            # like a symbol-bearing name (e.g. "required." would otherwise pass the
            # "contains a `.`" check that's meant for names like "Node.js").
            cleaned = token.rstrip(".,;:)")
            if not cleaned:
                continue
            treat_as_first = match.start() == first_token_start and not single_token_line
            if not _is_techy(cleaned, is_first_token=treat_as_first):
                continue
            _record(f"~{cleaned.lower()}", Candidate(term=cleaned, section=section, weight=weight))

    return candidates


# -- classification against a resolved resume ---------------------------------------------


class Status(StrEnum):
    PRESENT = "present"
    PRESENT_AS_ALIAS = "present_as_alias"
    MISSING_FROM_TARGET = "missing_from_target"  # in master, just not selected for this target
    MISSING = "missing"  # not in master at all -- a real gap, or add it to master if true


@dataclass(frozen=True)
class MatchLine:
    candidate: Candidate
    status: Status
    note: str = ""


@dataclass(frozen=True)
class MatchReport:
    lines: tuple[MatchLine, ...]
    score: float  # weighted coverage in [0, 1]; 1.0 means every candidate is PRESENT

    def by_status(self, status: Status) -> list[MatchLine]:
        return [line for line in self.lines if line.status == status]


def match(resume: ResolvedResume, jd_text: str, master: Master) -> MatchReport:
    candidates = extract_candidates(jd_text, master)
    resume_text = " ".join(resume.reading_order())
    master_index = master.index()

    lines: list[MatchLine] = []
    for candidate in candidates:
        if candidate.term in resume_text:
            lines.append(MatchLine(candidate, Status.PRESENT))
        elif candidate.skill_id is not None:
            skill_in_target = any(s.id == candidate.skill_id for s in resume.skills)
            if not skill_in_target and candidate.skill_id in master_index:
                lines.append(
                    MatchLine(
                        candidate,
                        Status.MISSING_FROM_TARGET,
                        note="in master.yaml, not selected into this target's skills",
                    )
                )
            else:
                lines.append(
                    MatchLine(
                        candidate,
                        Status.PRESENT_AS_ALIAS,
                        note=f"JD says {candidate.matched_via!r}; resume says {candidate.term!r}"
                        if candidate.matched_via and candidate.matched_via != candidate.term
                        else "selected, but exact string not found in rendered text",
                    )
                )
        else:
            lines.append(MatchLine(candidate, Status.MISSING))

    total_weight = sum(c.weight for c in candidates)
    matched_weight = sum(line.candidate.weight for line in lines if line.status == Status.PRESENT)
    score = matched_weight / total_weight if total_weight else 1.0
    return MatchReport(lines=tuple(lines), score=score)
