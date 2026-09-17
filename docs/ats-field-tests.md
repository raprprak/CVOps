# ATS field-test log

Lint (`.claude/rules/ats-compliance.md`, rules L1-L10) proves a compiled PDF is
*parseable* by a generic, spec-following extractor. It cannot prove any specific ATS
parses it the way that ATS actually behaves — vendors diverge from the spec in their own
ways. This log is the only source of truth for that: a real upload to a real portal's
resume-import/autofill flow, not a lint run.

## How to log an entry

1. Compile the target you're about to submit and note its commit: `cvops build <slug>`,
   `git rev-parse --short HEAD`.
2. Upload `out/<slug>.pdf` through the portal's actual parse step — the "import resume" /
   "autofill with resume" flow, not just attaching a file to a message.
3. Add one row below per (portal, resume version) pair, as soon as you see the result.
4. Any field that fails becomes a new lint rule (extend `ats_lint.py` +
   `.claude/rules/ats-compliance.md`) or a template fix in
   `src/cvops/templates/resume/` — not just a note here. Link the follow-up commit in
   the last column once it lands.

Field columns: `ok` parsed correctly, `wrong` parsed but mangled/misfiled, `miss` didn't
populate at all, `n/a` this flow doesn't have that field.

## Log

| Date | Portal | Flow | Slug @ commit | Name | Email | Phone | Experience | Education | Skills | Notes / follow-up |
| ---- | ------ | ---- | -------------- | ---- | ----- | ----- | ---------- | --------- | ------ | ------------------ |
|      |        |      |                |      |       |       |            |           |        |                    |

## Findings promoted to lint rules

(none yet)
