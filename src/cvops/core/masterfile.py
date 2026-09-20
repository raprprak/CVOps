"""Write additions into data/master.yaml without disturbing what is already in it.

master.yaml is hand-curated: it carries comments and folded text, and a plain load/dump would
erase them. So new entities are inserted into the round-trip YAML tree (ruamel.yaml), and the
result is verified before it replaces the file.
"""

from __future__ import annotations

import io
import os
import re
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel
from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap, CommentedSeq

from cvops.core.files import DataError, load_master
from cvops.models.master import Master


def _yaml() -> YAML:
    y = YAML()  # round-trip: keeps comments, quoting and key order
    y.preserve_quotes = True
    y.indent(mapping=2, sequence=4, offset=2)  # master.yaml's existing layout
    y.width = 100_000  # existing one-line strings must not be re-wrapped
    return y


def _node(value: Any) -> Any:
    """Plain data -> ruamel nodes; scalar lists stay in flow style ([a, b]) like the file's."""
    if isinstance(value, dict):
        node = CommentedMap()
        for k, v in value.items():
            node[k] = _node(v)
        return node
    if isinstance(value, list):
        seq = CommentedSeq(_node(v) for v in value)
        if not any(isinstance(v, dict) for v in value):
            seq.fa.set_flow_style()
        return seq
    return value


def _dump(item: BaseModel) -> Any:
    return _node(item.model_dump(mode="json", exclude_none=True))


def patch_master_text(text: str, before: Master, after: Master) -> str:
    """`text` (master.yaml) with everything `after` added over `before` inserted in place.

    A merge only ever adds, and places each addition at its index in `after`'s lists, so the
    same index works in the file. Ids in `before` are the entities already in the file.
    """
    y = _yaml()
    doc = y.load(text)
    known = set(before.index())

    def sync(parent: Any, key: str, items: list[Any], child: str | None = None) -> None:
        seq = parent.get(key)
        if seq is None:
            if all(it.id in known for it in items):
                return
            seq = parent[key] = CommentedSeq()
        by_id = {n.get("id"): n for n in seq if isinstance(n, CommentedMap)}
        for i, it in enumerate(items):
            if it.id not in known:
                seq.insert(i, _dump(it))
                seq.fa.set_block_style()
            elif child and it.id in by_id:
                sync(by_id[it.id], child, getattr(it, child))

    sync(doc, "summaries", after.summaries)
    sync(doc, "skills", after.skills)
    sync(doc, "experience", after.experience, "bullets")
    sync(doc, "projects", after.projects, "bullets")
    sync(doc, "education", after.education, "details")
    sync(doc, "certifications", after.certifications)

    # Links carry no id; they are matched by URL.
    known_urls = {link.url for link in before.basics.links}
    links = doc["basics"].get("links")
    for i, link in enumerate(after.basics.links):
        if link.url not in known_urls:
            if links is None:
                links = doc["basics"]["links"] = CommentedSeq()
            links.insert(i, _dump(link))
            links.fa.set_block_style()

    buf = io.StringIO()
    y.dump(doc, buf)
    return buf.getvalue()


def _comments(text: str) -> int:
    return len(re.findall(r"(?:^|\s)#", text, re.M))


def save_master(path: Path, before: Master, after: Master, backup_dir: Path) -> None:
    """Add what `after` has over `before` to master.yaml, keeping its comments and layout.

    Verified before anything is replaced: the patched file must load, equal `after` exactly, and
    lose no comment. The previous file is copied to `backup_dir` first (git is the other undo).
    """
    original = path.read_text(encoding="utf-8")
    patched = patch_master_text(original, before, after)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(patched, encoding="utf-8")
    try:
        if load_master(tmp).model_dump() != after.model_dump():
            raise DataError("patched master.yaml differs from the merge result; nothing written")
        if _comments(patched) < _comments(original):
            raise DataError("patching would drop comments from master.yaml; nothing written")
    except DataError:
        tmp.unlink(missing_ok=True)
        raise
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S")
    shutil.copy2(path, backup_dir / f"master-{stamp}.yaml")
    os.replace(tmp, path)
