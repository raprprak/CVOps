from pathlib import Path

from cvops.models.master import Master
from cvops.models.target import Target
from cvops.services.match import Status, extract_candidates, match
from cvops.services.resolve import resolve

JD_BASIC = (Path(__file__).parent / "fixtures" / "jd_basic.md").read_text()


def _candidate(candidates, term):
    return next(c for c in candidates if c.term == term)


def test_finds_master_skill_by_exact_name(master: Master) -> None:
    candidates = extract_candidates("We need Python and FastAPI.", master)
    terms = {c.term: c for c in candidates}
    assert terms["Python"].skill_id == "sk-python"
    assert terms["FastAPI"].skill_id == "sk-fastapi"
    assert terms["Python"].matched_via == "Python"


def test_finds_skill_by_alias_and_records_the_jd_spelling(master: Master) -> None:
    (candidate,) = extract_candidates("Experience with Postgres required.", master)
    assert candidate.skill_id == "sk-postgresql"
    assert candidate.term == "PostgreSQL"  # canonical master spelling
    assert candidate.matched_via == "Postgres"  # what the JD actually said


def test_section_weights(master: Master) -> None:
    candidates = extract_candidates(JD_BASIC, master)
    by_term = {c.term: c for c in candidates}
    assert by_term["Python"].section == "required"
    assert by_term["Python"].weight == 2.0
    assert by_term["GraphQL"].section == "preferred"
    assert by_term["GraphQL"].weight == 0.5
    assert by_term["FastAPI"].section == "general"
    assert by_term["FastAPI"].weight == 1.0


def test_heuristic_tokens_surface_gaps_not_in_master(master: Master) -> None:
    candidates = extract_candidates(JD_BASIC, master)
    heuristic_terms = {c.term for c in candidates if c.skill_id is None}
    assert {"Docker", "Kubernetes", "GraphQL"} <= heuristic_terms


def test_years_of_experience_noise_is_excluded(master: Master) -> None:
    candidates = extract_candidates(JD_BASIC, master)
    assert "3+" not in {c.term for c in candidates}


def test_candidates_are_deduplicated(master: Master) -> None:
    text = "Python required. Also: Python, Python, and more Python."
    candidates = extract_candidates(text, master)
    assert sum(1 for c in candidates if c.term == "Python") == 1


def test_match_classifies_present_missing_from_target_and_missing(
    master: Master, basic_target: Target
) -> None:
    resume = resolve(master, basic_target, slug="basic")
    report = match(resume, JD_BASIC, master)
    by_term = {line.candidate.term: line for line in report.lines}

    # FastAPI and Python are both selected into basic_target and appear in its text
    assert by_term["FastAPI"].status == Status.PRESENT
    assert by_term["Python"].status == Status.PRESENT

    # PostgreSQL is a real master skill (matched via the "Postgres" alias) but basic_target
    # doesn't select sk-postgresql -- a target-composition gap, not a capability gap.
    assert by_term["PostgreSQL"].status == Status.MISSING_FROM_TARGET

    # Docker isn't anywhere in master -- a genuine, unaddressed gap.
    assert by_term["Docker"].status == Status.MISSING


def test_score_only_counts_present_weighted_by_section(
    master: Master, basic_target: Target
) -> None:
    resume = resolve(master, basic_target, slug="basic")
    jd = "Requirements:\n- Python\n- Docker\n"
    report = match(resume, jd, master)
    # Python present (weight 2.0, required), Docker missing (weight 2.0, required)
    assert report.score == 0.5
