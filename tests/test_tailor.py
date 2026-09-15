from pathlib import Path

from cvops.models.master import Master
from cvops.services.resolve import resolve
from cvops.services.tailor import tailor

JD_BASIC = (Path(__file__).parent / "fixtures" / "jd_basic.md").read_text()


def test_tailor_produces_a_resolvable_target(master: Master) -> None:
    target = tailor(master, JD_BASIC)
    resume = resolve(master, target, slug="tailored")  # raises ResolveError if anything is off
    assert resume.slug == "tailored"


def test_tailor_selects_only_scoring_bullets(master: Master) -> None:
    target = tailor(master, JD_BASIC)
    by_ref = {sel.ref: sel for sel in target.experience}
    # exp-a-01 is tagged [python, fastapi] -- both JD keywords; exp-a-02 is [unrelated]
    assert by_ref["exp-a"].bullets == ["exp-a-01"]
    # exp-b-01 is tagged [postgresql], matching the JD's "Postgres" via the skill alias
    assert by_ref["exp-b"].bullets == ["exp-b-01"]


def test_tailor_excludes_a_project_with_no_relevant_bullets(master: Master) -> None:
    target = tailor(master, JD_BASIC)
    # prj-a-01 ("Built it.") has no tags, so nothing in master ties it to this JD
    assert target.projects == []


def test_tailor_orders_skills_jd_matches_first(master: Master) -> None:
    target = tailor(master, JD_BASIC)
    # master order is [sk-python, sk-cpp, sk-fastapi, sk-postgresql]; the JD matches
    # python/fastapi/postgresql (via alias) but not cpp -- matches lead, in master order,
    # then whatever wasn't matched.
    assert target.skills == ["sk-python", "sk-fastapi", "sk-postgresql", "sk-cpp"]


def test_tailor_keeps_every_education_entry_unfiltered(master: Master) -> None:
    target = tailor(master, JD_BASIC)
    assert [sel.ref for sel in target.education] == ["edu-a"]
    assert target.education[0].details is None  # every master detail, untouched


def test_tailor_records_the_jd_path(master: Master) -> None:
    target = tailor(master, JD_BASIC, jd_path="jds/acme-backend.md")
    assert target.jd == "jds/acme-backend.md"


def test_tailor_never_writes_an_override(master: Master) -> None:
    # The structural "zero fabrication" guarantee: tailor only selects and orders ids.
    target = tailor(master, JD_BASIC)
    assert target.overrides == []
