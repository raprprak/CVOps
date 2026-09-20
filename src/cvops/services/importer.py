"""Turn an uploaded PDF/DOCX into a draft in Master's shape.

Deterministic, offline heuristics -- no LLM. Text is copied from the source (whitespace
normalised); the only invented values are IDs and a month defaulted to 01 when a date carries
only a year, and the latter is always reported in ``warnings``. Layouts vary, so the result is
a *draft* for a human to review, never written to master.yaml directly.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass
from typing import Any

import pdfplumber
from docx import Document
from pydantic import ValidationError

from cvops.models.common import normalize_ws
from cvops.models.master import Master


class ImportFailure(ValueError):
    """The file could not be read, or holds no extractable text."""


@dataclass
class Parsed:
    master: dict[str, Any]
    warnings: list[str]


# -- text extraction ---------------------------------------------------------------------


def extract_text(data: bytes, kind: str) -> tuple[str, list[str]]:
    """Plain text of a 'pdf' or 'docx', plus notes about what was not read."""
    notes: list[str] = []
    if kind == "pdf":
        # pdfplumber rebuilds lines from glyph positions. pypdf's plain extraction emits one
        # line per text run, which for PDFs that position every word separately (many Word and
        # Google Docs exports) means one word per line and nothing left to parse.
        try:
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                return "\n".join(page.extract_text() or "" for page in pdf.pages), notes
        except Exception as exc:  # pdfminer raises many types on malformed/encrypted input
            raise ImportFailure(f"unreadable PDF: {exc}") from exc
    try:
        doc = Document(io.BytesIO(data))
    except Exception as exc:  # python-docx/zipfile/lxml raise many types on malformed input
        raise ImportFailure(f"unreadable DOCX: {exc}") from exc
    if doc.tables:
        notes.append(f"the DOCX has {len(doc.tables)} table(s); their text was not read")
    lines = [
        ("• " if p.style is not None and (p.style.name or "").lower().startswith("list") else "")
        + p.text
        for p in doc.paragraphs
    ]
    return "\n".join(lines), notes


# -- patterns ----------------------------------------------------------------------------

_BULLET = re.compile(r"^\s*(?:[•·▪▫◦●■◆➢➤]\s*|[*\-–—]\s+)")

_MONTHS = {m: i for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split(), 1)}
_MON = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?"
_POINT = rf"(?:{_MON}\s+\d{{4}}|\d{{1,2}}/\d{{4}}|\d{{4}}-\d{{2}}|\d{{4}})"
_NOW = r"present|current|now|ongoing|till date|to date"
_RANGE = re.compile(rf"(?P<s>{_POINT})\s*(?:-|–|—|to)\s*(?P<e>{_POINT}|{_NOW})", re.I)
_POINT_RE = re.compile(_POINT, re.I)

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_PHONE = re.compile(r"\+?\d[\d ()./-]{7,}\d")
_URL = re.compile(r"(?:https?://|www\.)\S+|(?:linkedin\.com|github\.com)/\S+", re.I)
_PLACE_WORDS = r"[A-Z][A-Za-z.'-]*(?: [A-Za-z.'-]+){0,2}"
_PLACE = re.compile(rf"{_PLACE_WORDS}(?:, ?{_PLACE_WORDS})*")

_TITLE_WORDS = (
    r"engineer|developer|manager|consultant|analyst|architect|lead|director|intern|scientist"
    r"|designer|administrator|specialist|officer|associate|programmer|technician|head|president"
    r"|founder|coordinator|executive|trainee|tester|qa"
)
_TITLE = re.compile(rf"\b(?:{_TITLE_WORDS})\b", re.I)
# "Engineering Lead Noida, India": a job title followed by a City, Region location.
_TITLE_LOC = re.compile(
    rf"^(?P<t>.*\b(?i:{_TITLE_WORDS})\b)\s+"
    r"(?P<loc>[A-Z][A-Za-z .'-]+(?:,\s*[A-Z][A-Za-z .'-]+)+)$"
)
_INSTITUTION = re.compile(r"\b(university|college|institute|school|academy|polytechnic)\b", re.I)
_DEGREE = re.compile(
    r"\b(b\.?\s?tech|b\.?\s?e|b\.?\s?sc|b\.?\s?s|b\.?\s?a|bachelor|m\.?\s?tech|m\.?\s?sc"
    r"|m\.?\s?s|m\.?\s?a|mba|master|ph\.?\s?d|doctor|diploma|associate)\b",
    re.I,
)

_SECTIONS = {
    "summary": (
        "summary",
        "professional summary",
        "profile",
        "professional profile",
        "objective",
        "career objective",
        "about me",
        "about",
    ),
    "skills": (
        "skills",
        "technical skills",
        "key skills",
        "core skills",
        "core competencies",
        "technical proficiencies",
        "area of expertise",
        "areas of expertise",
        "expertise",
        "core expertise",
    ),
    "experience": (
        "experience",
        "work experience",
        "professional experience",
        "employment history",
        "work history",
        "employment",
        "relevant experience",
        "career history",
    ),
    "education": ("education", "academic background", "education & training", "academics"),
    "projects": ("projects", "personal projects", "key projects", "selected projects"),
    "certifications": (
        "certifications",
        "certificates",
        "licenses & certifications",
        "certifications & licenses",
        "licenses",
    ),
}
_HEADING = {alias: name for name, aliases in _SECTIONS.items() for alias in aliases}
# Real resume sections the Master schema has no place for.
_IGNORED = {
    "awards",
    "achievements",
    "interests",
    "hobbies",
    "languages",
    "references",
    "publications",
    "volunteer experience",
    "volunteering",
    "declaration",
    "personal details",
}


# -- helpers -----------------------------------------------------------------------------


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:30].strip("-") or "x"


def _uid(prefix: str, text: str, used: set[str]) -> str:
    """A unique, schema-valid id like 'exp-acme'; a numeric suffix breaks ties."""
    base = f"{prefix}-{_slug(text)}"
    uid, n = base, 1
    while uid in used:
        n += 1
        uid = f"{base}-{n}"
    used.add(uid)
    return uid


def _ym(point: str) -> tuple[str, bool]:
    """A point in time -> ('YYYY-MM', whether the month was actually given)."""
    p = point.strip().lower().rstrip(".")
    m = re.fullmatch(r"([a-z]+)\.?\s+(\d{4})", p)
    if m:
        return f"{m[2]}-{_MONTHS[m[1][:3]]:02d}", True
    m = re.fullmatch(r"(?:(\d{1,2})/(\d{4})|(\d{4})-(\d{2}))", p)
    if m:
        year, month = (m[2], m[1]) if m[1] else (m[3], m[4])
        if 1 <= int(month) <= 12:
            return f"{year}-{int(month):02d}", True
    return f"{re.search(r'\d{4}', p)[0]}-01", False


_Date = tuple[str | None, str | None, bool, tuple[int, int], str]


def _date(line: str, single: bool) -> _Date | None:
    """The date in `line`: (start, end or None = present, month defaulted, span, matched text).

    A range always counts; with `single`, so does one date ('June 2015'), read as an end date.
    """
    rng = _RANGE.search(line)
    if rng:
        start, s_ok = _ym(rng["s"])
        if re.fullmatch(_NOW, rng["e"].strip(), re.I):
            return start, None, not s_ok, rng.span(), rng[0]
        end, e_ok = _ym(rng["e"])
        return start, end, not (s_ok and e_ok), rng.span(), rng[0]
    if single:
        pt = _POINT_RE.search(line)
        if pt:
            end, ok = _ym(pt[0])
            return None, end, not ok, pt.span(), pt[0]
    return None


def _clean(text: str) -> str:
    """What is left of a line once its date is cut out: no stray separators or empty commas."""
    text = re.sub(r"\s*(?:,\s*){2,}", ", ", text)
    return normalize_ws(text.strip(" |,-–—•·()"))


def _split(lines: list[str]) -> tuple[list[str], dict[str, list[str]], list[str]]:
    """(header lines, {section: lines}, ignored section headings)."""
    header: list[str] = []
    sections: dict[str, list[str]] = {}
    ignored: list[str] = []
    sink: list[str] | None = header
    for line in lines:
        key = " ".join(re.sub(r"[^a-z& ]", "", line.lower()).split())
        if key in _HEADING:
            sink = sections.setdefault(_HEADING[key], [])
        elif key in _IGNORED:
            sink = None
            ignored.append(line)
        elif sink is not None:
            sink.append(line)
    return header, sections, ignored


def _has_date(line: str) -> bool:
    return not _BULLET.match(line) and _RANGE.search(line) is not None


def _regroup(sections: dict[str, list[str]]) -> None:
    """Repair layouts where headings don't own what follows them.

    Some resumes put the summary under "Experience", or start listing jobs with no heading
    (straight after a skills block). Prose with no dates under "Experience" is the summary; and
    if no section holds jobs, the first section containing a dated line is split there.
    """
    exp = sections.get("experience", [])
    if exp and not any(_has_date(line) for line in exp):
        sections.setdefault("summary", exp)
        sections["experience"] = exp = []
    if exp:
        return
    for name in ("skills", "summary", "certifications"):
        lines = sections.get(name, [])
        k = next((i for i, line in enumerate(lines) if _has_date(line)), None)
        if k is None:
            continue
        # A company line usually sits just above "Title (dates)"; a bare date line has two
        # header lines above it.
        prev = lines[k - 1] if k else ""
        rest = _RANGE.sub("", lines[k]).strip(" |,-–—•·()")
        n_above = 2 if not rest else 1 if prev[:1].isupper() and len(prev.split()) <= 6 else 0
        start = max(0, k - n_above)
        sections["experience"] = lines[start:]
        sections[name] = lines[:start]
        return


def _skills_line(line: str) -> bool:
    """A 'Category: a, b, c' line -- skills that were written after the last job."""
    return ":" in line[:40] and line.count(",") >= 2


def _entries(
    lines: list[str], warnings: list[str], extra_skills: list[str], *, single_date: bool = False
) -> list[dict]:
    """Group lines into dated entries.

    An entry starts at the line holding a date; the (up to two) non-bullet lines around it are
    its header and the bullets after it are its bullets. A non-bullet line after a bullet is
    that bullet's wrapped tail unless a date follows within two lines (then it heads the next
    entry). 'Category: a, b, c' lines are skills, collected into `extra_skills`.
    """
    entries: list[dict] = []
    pending: list[str] = []
    cur: dict | None = None
    in_skills = False
    dated = [not _BULLET.match(line) and _date(line, single_date) is not None for line in lines]
    for i, line in enumerate(lines):
        bullet = _BULLET.match(line)
        found = None if bullet else _date(line, single_date)
        # A date on the next line, or two lines on with no bullet between (Title / Company / Dates).
        heads_entry = (i + 1 < len(lines) and dated[i + 1]) or (
            i + 2 < len(lines) and dated[i + 2] and not _BULLET.match(lines[i + 1])
        )
        if found:
            start, end, defaulted, span, shown = found
            if defaulted:
                warnings.append(f"month unknown in {shown!r}; defaulted to 01")
            rest = _clean(line[: span[0]] + " " + line[span[1] :])
            header = [*pending, *([rest] if rest else [])][-2:]
            cur = {"header": header, "start": start, "end": end, "bullets": []}
            entries.append(cur)
            pending = []
            in_skills = False
        elif bullet:
            in_skills = False
            if cur is not None:
                cur["bullets"].append(normalize_ws(line[bullet.end() :]))
        elif line.endswith(":") and len(line.split()) <= 3:
            continue  # a label such as "Responsibilities:"
        elif (in_skills and not heads_entry) or _skills_line(line):
            in_skills = True
            extra_skills.append(line)
        elif cur is not None and cur["bullets"] and (line[0].islower() or not heads_entry):
            cur["bullets"][-1] = normalize_ws(f"{cur['bullets'][-1]} {line}")
        elif cur is not None and not cur["bullets"] and len(cur["header"]) < 2:
            cur["header"].append(normalize_ws(line))
        else:
            pending.append(normalize_ws(line))
    return entries


def _continues(line: str, prev: str) -> bool:
    """Is `line` the wrapped tail of bullet `prev`, rather than a new item?"""
    return (
        line[0].islower()
        or line[0].isdigit()
        or (not prev.rstrip().endswith((".", "!", "?", ":")) and len(line.split()) > 6)
    )


def _bullets(parent: str, texts: list[str], used: set[str]) -> list[dict[str, Any]]:
    return [
        {"id": _uid(parent, f"{i:02d}", used), "text": t, "tags": []}
        for i, t in enumerate(texts, 1)
        if t
    ]


def _role(header: list[str]) -> tuple[str, str, bool, str | None]:
    """(title, company, confident, location). The line with a job-title word is the title."""
    title, company, sure = "", "", False
    if len(header) >= 2:
        a, b = header[0], header[1]
        if _TITLE.search(b) and not _TITLE.search(a):
            title, company, sure = b, a, True
        else:
            title, company, sure = a, b, bool(_TITLE.search(a))
    elif header:
        h = header[0]
        parts = re.split(r"\s+(?:at|@)\s+|\s*\|\s*|\s+[-–—]\s+", h, maxsplit=1)
        if len(parts) == 1 and _TITLE.search(h.split(",")[0]):
            parts = h.split(",", 1)
        if len(parts) == 2:
            a, b = parts[0].strip(), parts[1].strip()
            if _TITLE.search(b) and not _TITLE.search(a):
                title, company, sure = b, a, True
            else:
                title, company, sure = a, b, bool(_TITLE.search(a))
        else:
            title = h
    location = None
    m = _TITLE_LOC.match(title)
    if m:
        title, location = m["t"], m["loc"]
    return title, company, sure, location


# -- sections ----------------------------------------------------------------------------


def _basics(header: list[str], warnings: list[str]) -> dict[str, Any]:
    text = "\n".join(header)
    email = _EMAIL.search(text)
    phone = next((m[0] for m in _PHONE.finditer(text) if len(re.sub(r"\D", "", m[0])) >= 10), "")
    name = next(
        (
            line
            for line in header[:3]
            if not re.search(r"[\d@]", line)
            and 1 <= len(line.split()) <= 5
            and line.lower() not in {"resume", "curriculum vitae", "cv"}
        ),
        "",
    )
    links: list[dict[str, str]] = []
    for m in _URL.finditer(text):
        url = m[0].rstrip(".,;)|")
        if any(link["url"] == url for link in links):
            continue
        low = url.lower()
        label = "Website"
        if "linkedin.com" in low:
            label = "LinkedIn"
        elif "github.com" in low:
            label = "GitHub"
        links.append({"label": label, "url": url})

    # Location: what is left of a contact line once email/phone/URL are cut out ("Delhi,
    # a@b.com, +91..."), or a "City, Region" on a line of its own.
    location = None
    for line in header:
        if line == name or location:
            continue
        rest = _URL.sub(" ", _EMAIL.sub(" ", _PHONE.sub(" ", line)))
        for part in re.split(r"\s*[|•·]\s*", rest):
            part = part.strip(" ,;-")
            if (
                part
                and _PLACE.fullmatch(part)
                and not _TITLE.search(part)
                and (rest != line or "," in part)
            ):
                location = part
                break

    for what, value in (("name", name), ("email", email), ("phone", phone)):
        if not value:
            warnings.append(f"could not find a {what} in the header")
    return {
        "name": name,
        "email": email[0] if email else "",
        "phone": phone,
        "location": location,
        "links": links,
    }


def _skills(lines: list[str], used: set[str]) -> list[dict[str, Any]]:
    # Rejoin lines wrapped mid-list: a line continuing lowercase, after a comma, or inside
    # an unclosed parenthesis belongs to the previous one.
    joined: list[str] = []
    for raw in lines:
        line = _BULLET.sub("", raw).strip()
        if not line:
            continue
        prev = joined[-1] if joined else ""
        if prev and (
            line[0].islower()
            or line[0] == "("
            or prev.endswith((",", ";"))
            or prev.count("(") > prev.count(")")
        ):
            joined[-1] = f"{prev} {line}"
        else:
            joined.append(line)

    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for line in joined:
        head, sep, tail = line.partition(":")
        is_cat = sep and "," not in head and len(head.split()) <= 4
        category, items = (head.strip(), tail) if is_cat else (None, line)
        for raw in re.split(r"[,;|•·](?![^()]*\))\s*", items):  # not commas inside parentheses
            name = normalize_ws(raw).rstrip(".")
            if name and name.lower() not in seen:
                seen.add(name.lower())
                out.append(
                    {
                        "id": _uid("sk", name, used),
                        "name": name,
                        "category": category,
                        "tags": [],
                        "aliases": [],
                    }
                )
    return out


def _experience(
    lines: list[str], used: set[str], warnings: list[str], extra_skills: list[str]
) -> list[dict[str, Any]]:
    out = []
    for e in _entries(lines, warnings, extra_skills):
        title, company, sure, location = _role(e["header"])
        if not sure:
            shown = " / ".join(e["header"]) or "(no header)"
            warnings.append(f"check title/company for the role starting {e['start']}: {shown}")
        eid = _uid("exp", company or title or "role", used)
        out.append(
            {
                "id": eid,
                "company": company,
                "title": title,
                "location": location,
                "start": e["start"],
                "end": e["end"],
                "bullets": _bullets(eid, e["bullets"], used),
            }
        )
    return out


def _join_wrapped(lines: list[str]) -> list[str]:
    """Rejoin a header line that wrapped mid-phrase (its last word is lowercase: 'of', 'for')."""
    out: list[str] = []
    for line in lines:
        if out and out[-1].split()[-1].islower():
            out[-1] = f"{out[-1]} {line}"
        else:
            out.append(line)
    return out


def _education(lines: list[str], used: set[str], warnings: list[str]) -> list[dict[str, Any]]:
    out = []
    entries = _entries(lines, warnings, [], single_date=True)
    if not entries and lines:  # no dates at all: read the first lines as one entry
        warnings.append("no dates in the education section; check what was read as one entry")
        entries = [{"header": lines[:3], "start": None, "end": None, "bullets": []}]
    for e in entries:
        h = _join_wrapped(e["header"])
        if len(h) == 1:  # "B.Tech in CS, State University, Kanpur" on one line
            h = [p.strip() for p in re.split(r"\s*[,|]\s*|\s+[-–—]\s+", h[0]) if p.strip()]
        inst = next((x for x in h if _INSTITUTION.search(x)), "")
        deg = next((x for x in h if x != inst and _DEGREE.search(x)), "")
        rest = [x for x in h if x not in (inst, deg)]
        if not inst and rest:
            inst = rest.pop(0)
        if not deg and rest:
            deg = rest.pop(0)
        if not (inst and deg):
            warnings.append(f"check education entry: {' / '.join(e['header']) or '(no header)'}")
        degree, field = deg, None
        parts = re.split(r"\s+in\s+", deg, maxsplit=1)  # "Bachelor of Technology in CS"
        if len(parts) == 2:
            degree, field = parts
        eid = _uid("edu", inst or deg or "education", used)
        out.append(
            {
                "id": eid,
                "institution": inst,
                "degree": degree,
                "field": field,
                "location": rest[0].rstrip(".") if rest else None,
                "start": e["start"],
                "end": e["end"],
                "details": _bullets(eid, e["bullets"], used),
            }
        )
    return out


def _projects(lines: list[str], used: set[str]) -> list[dict[str, Any]]:
    raw: list[dict] = []
    cur: dict | None = None
    for line in lines:
        bullet = _BULLET.match(line)
        if bullet:
            if cur is not None:
                cur["bullets"].append(normalize_ws(line[bullet.end() :]))
        elif cur is not None and cur["bullets"] and _continues(line, cur["bullets"][-1]):
            cur["bullets"][-1] = normalize_ws(f"{cur['bullets'][-1]} {line}")
        else:
            cur = {"name": normalize_ws(line), "bullets": []}
            raw.append(cur)
    out = []
    for p in raw:
        pid = _uid("proj", p["name"], used)
        url = _URL.search(p["name"])
        out.append(
            {
                "id": pid,
                "name": p["name"],
                "url": url[0] if url else None,
                "start": None,
                "end": None,
                "bullets": _bullets(pid, p["bullets"], used),
            }
        )
    return out


def _certifications(lines: list[str], used: set[str]) -> list[dict[str, Any]]:
    names = [normalize_ws(_BULLET.sub("", line)) for line in lines]
    return [
        {"id": _uid("cert", n, used), "name": n, "issuer": None, "date": None, "url": None}
        for n in names
        if n
    ]


# -- entry points ------------------------------------------------------------------------


def parse(text: str) -> Parsed:
    lines = [n for n in (normalize_ws(raw) for raw in text.splitlines()) if n]
    warnings: list[str] = []
    header, sections, ignored = _split(lines)
    if not sections:
        warnings.append(
            "no standard section headings found (Experience, Education, Skills, ...); "
            "only the contact details were read"
        )
    warnings.extend(f"ignored section {h!r}: the master schema has no place" for h in ignored)
    _regroup(sections)

    used: set[str] = set()
    summary = normalize_ws(" ".join(sections.get("summary", [])))
    if summary:
        used.add("sum-main")
    extra_skills: list[str] = []
    experience = _experience(sections.get("experience", []), used, warnings, extra_skills)
    master = {
        "basics": _basics(header, warnings),
        "summaries": [{"id": "sum-main", "text": summary, "tags": []}] if summary else [],
        "skills": _skills([*sections.get("skills", []), *extra_skills], used),
        "experience": experience,
        "projects": _projects(sections.get("projects", []), used),
        "education": _education(sections.get("education", []), used, warnings),
        "certifications": _certifications(sections.get("certifications", []), used),
    }
    return Parsed(master=master, warnings=warnings)


def check(master: dict[str, Any]) -> list[str]:
    """Master-schema violations in a draft, as 'path: message' lines (empty = applicable)."""
    try:
        Master.model_validate(master)
    except ValidationError as exc:
        return [
            f"{'.'.join(str(p) for p in e['loc']) or '<root>'}: {e['msg']}" for e in exc.errors()
        ]
    return []
