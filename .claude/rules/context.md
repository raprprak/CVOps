# Graphify discovery policy

When doing broad codebase discovery in this repo — understanding how a feature is wired end-to-end, mapping dependencies between backend services and frontend consumers, or onboarding to an unfamiliar part of the codebase — prefer the **graphify** skill to build/consult a knowledge graph instead of manually grepping and reading many files one by one.

**Why:** open-ended multi-file exploration burns tokens reading files whose relevance isn't known in advance. A knowledge graph front-loads that cost once, so later discovery becomes graph queries instead of repeated file reads.

**When to use it:**
- Tracing the compile pipeline (`backend/services/render.py` → `ats_lint.py` → `match.py`) through to the API routes and frontend consumers.
- Understanding the career-data schema shape across `backend/models/` and its frontend TypeScript mirror.
- Any "how does X relate to Y across the codebase" question spanning more than ~3 files.

**When not to use it:** a single known file lookup, or a targeted grep for one symbol — use normal tools directly, don't invoke graphify for that.

Invoke via `/graphify` or the Skill tool with `skill: "graphify"`.
