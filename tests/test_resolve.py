import pytest

from cvops.models.master import Master
from cvops.models.target import Target
from cvops.services.resolve import ResolveError, resolve


def test_resolve_selects_and_orders(master: Master, basic_target: Target) -> None:
    resume = resolve(master, basic_target, slug="basic")

    # sections keep target order, and empty ones are dropped (none are empty here)
    assert resume.sections == [
        "skills",
        "experience",
        "summary",
        "projects",
        "education",
        "certifications",
    ]
    assert [s.name for s in resume.skills] == ["FastAPI", "Python", "C++"]
    assert [e.id for e in resume.experience] == ["exp-a", "exp-b"]
    # explicit bullet order wins over master order
    assert [b.id for b in resume.experience[0].bullets] == ["exp-a-02", "exp-a-01"]
    # `bullets` omitted -> every master bullet
    assert [b.id for b in resume.experience[1].bullets] == ["exp-b-01"]
    # `details: []` -> the entry prints with no detail lines
    assert resume.education[0].details == []
    assert resume.experience[0].dates == "Jan 2021 – Present"
    assert resume.certifications[0].date == "Mar 2022"


def test_override_is_applied_and_flagged(master: Master, basic_target: Target) -> None:
    resume = resolve(master, basic_target, slug="basic")
    overridden = [t for t in resume.text_items() if t.overridden]
    assert [t.id for t in overridden] == ["exp-a-01"]
    assert overridden[0].text == "Did thing 1, rewritten for this target."
    assert overridden[0].metric is True  # metadata comes from the master bullet


def test_empty_sections_are_dropped(master: Master) -> None:
    target = Target.model_validate({"skills": ["sk-python"]})
    resume = resolve(master, target, slug="t")
    assert resume.sections == ["skills"]


def test_every_problem_is_reported_at_once(master: Master) -> None:
    target = Target.model_validate(
        {
            "summary": "nope",
            "skills": ["exp-a"],  # wrong kind
            "experience": [{"ref": "exp-a", "bullets": ["exp-b-01"]}],  # bullet of another role
            "overrides": [{"ref": "exp-b-01", "text": "unused"}],
        }
    )
    with pytest.raises(ResolveError) as info:
        resolve(master, target, slug="t")
    problems = info.value.problems
    assert any("unknown id 'nope'" in p for p in problems)
    assert any("'exp-a' is a experience, expected a skill" in p for p in problems)
    assert any("has no bullet 'exp-b-01' (exists under another entry)" in p for p in problems)
    assert any("'exp-b-01' is not selected" in p for p in problems)
    assert len(problems) == 4


def test_reading_order_matches_selection(master: Master, basic_target: Target) -> None:
    order = resolve(master, basic_target, slug="basic").reading_order()
    assert order[:3] == ["Test Person", "Email: test@example.com", "Phone: +1 555 010 0000"]
    assert order.index("Technical Skills") < order.index("Experience") < order.index("Summary")
    # group label precedes its skills; the override text is what prints
    assert order.index("Backend:") < order.index("FastAPI")
    assert "Did thing 1, rewritten for this target." in order
    assert "Did thing 1 -- measured 50% better." not in order
