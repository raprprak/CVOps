# Graphify discovery policy

When doing broad codebase discovery in this repo — understanding how a feature is wired end-to-end, mapping dependencies across the pipeline, or onboarding to an unfamiliar part of the codebase — consult the **graphify** knowledge graph before grepping and reading many files one by one.

**Where it lives:** `graphify-out/` at the repo root — `GRAPH_REPORT.md` (start here: communities, highlights, suggested questions), `graph.json` (queryable nodes/edges), `graph.html` (visual). It is regenerated on the developer's machine (`graphify update .`, or automatically via the installed git hook) after each phase commit. If `graphify-out/` is missing or older than the last commit, say so rather than assuming it is current.

**Why:** open-ended multi-file exploration burns tokens reading files whose relevance isn't known in advance. The graph front-loads that cost once, so later discovery becomes graph queries instead of repeated file reads.

**When to use it:**
- Tracing the pipeline (`resolve.py` → `render.py` → `ats_lint.py` / `match.py` → `cli.py`).
- Understanding the career-data schema across `models/master.py`, `models/target.py` and the resolved shape in `resolve.py`.
- Any "how does X relate to Y across the codebase" question spanning more than ~3 files.

**When not to use it:** a single known file lookup, or a targeted grep for one symbol — use normal tools directly.

Invoke regeneration via `/graphify` (Claude Code) or `graphify update .` (shell) when the skill is installed locally.
