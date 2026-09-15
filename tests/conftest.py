from pathlib import Path

import pytest

from cvops.core.files import load_master, load_target
from cvops.models.master import Master
from cvops.models.target import Target

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def master() -> Master:
    return load_master(FIXTURES / "master.yaml")


@pytest.fixture
def basic_target() -> Target:
    return load_target(FIXTURES / "targets" / "basic.yaml")
