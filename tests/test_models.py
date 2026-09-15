import datetime as dt

import pytest
from pydantic import ValidationError

from cvops.models.common import format_date_range, format_year_month
from cvops.models.master import Master
from cvops.models.target import Target


def _minimal_master(**extra: object) -> dict[str, object]:
    return {
        "basics": {"name": "N", "email": "e@x.com", "phone": "1"},
        **extra,
    }


def test_master_rejects_unknown_keys() -> None:
    with pytest.raises(ValidationError):
        Master.model_validate(_minimal_master(bogus=1))


def test_master_rejects_duplicate_ids_across_kinds() -> None:
    data = _minimal_master(
        skills=[{"id": "same", "name": "Python"}],
        experience=[
            {
                "id": "exp-a",
                "company": "C",
                "title": "T",
                "start": "2020-01",
                "bullets": [{"id": "same", "text": "x"}],
            }
        ],
    )
    with pytest.raises(ValidationError, match="duplicate id 'same'"):
        Master.model_validate(data)


def test_ids_must_be_kebab_case() -> None:
    with pytest.raises(ValidationError):
        Master.model_validate(_minimal_master(skills=[{"id": "Not Valid", "name": "x"}]))


def test_year_month_accepts_date_objects_from_yaml() -> None:
    # PyYAML turns an unquoted 2020-01-15 into a date; the model should normalize it.
    data = _minimal_master(
        experience=[{"id": "e", "company": "C", "title": "T", "start": dt.date(2020, 1, 15)}]
    )
    master = Master.model_validate(data)
    assert master.experience[0].start == "2020-01"


def test_year_month_rejects_bad_month() -> None:
    with pytest.raises(ValidationError):
        Master.model_validate(
            _minimal_master(
                experience=[{"id": "e", "company": "C", "title": "T", "start": "2020-13"}]
            )
        )


def test_bullet_text_is_collapsed_to_one_line(master: Master) -> None:
    bullet = master.index()["exp-a-02"][1]
    assert bullet.text == "Did thing 2 across two YAML lines."


def test_date_formatting() -> None:
    assert format_year_month("2022-04") == "Apr 2022"
    assert format_date_range("2022-04", None) == "Apr 2022 – Present"
    assert format_date_range("2019-07", "2022-03") == "Jul 2019 – Mar 2022"
    assert format_date_range(None, "2019-05") == "May 2019"
    assert format_date_range(None, None) is None


def test_target_defaults_and_uniqueness() -> None:
    target = Target.model_validate({})
    assert target.max_pages == 1
    assert target.sections[0] == "summary"
    with pytest.raises(ValidationError, match="duplicate section"):
        Target.model_validate({"sections": ["skills", "skills"]})
    with pytest.raises(ValidationError, match="duplicate ref"):
        Target.model_validate({"skills": ["a", "a"]})
    with pytest.raises(ValidationError, match="duplicate experience ref"):
        Target.model_validate({"experience": [{"ref": "a"}, {"ref": "a"}]})
    with pytest.raises(ValidationError, match="duplicate override ref"):
        Target.model_validate({"overrides": [{"ref": "a", "text": "x"}, {"ref": "a", "text": "y"}]})
