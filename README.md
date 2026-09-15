# CVOps

Resume-as-code for one person. A master career-data file and per-job "targets" are compiled
deterministically into ATS-safe PDFs (Typst), linted the way CI tests code, and scored for
keyword coverage against a job description.

## Requirements

- [uv](https://docs.astral.sh/uv/) and Python 3.12+
- `pdftotext` (poppler-utils) on PATH — `cvops lint`'s round-trip check runs it as a second,
  independent extractor alongside pdfplumber. macOS: `brew install poppler`.

## Usage

```
uv sync                      # installs typst-py, pdfplumber, typer, ...
uv run cvops build [--all]   # data/master.yaml + data/targets/<slug>.yaml -> out/<slug>.{typ,pdf}
uv run cvops lint  [--all]   # build, then check parse-fidelity + provenance rules (L1-L10)
uv run cvops show  <slug>    # print the resolved resume (exactly what the template will print) as JSON
uv run cvops match <slug>    # JD keyword coverage report: present / present-as-alias / missing
uv run cvops tailor <jd> <new-slug>   # propose a target from master.yaml + a JD (selection only, no rewrites)
uv run pytest                # unit tests (reportlab-synthesized PDFs for the linter; no Typst needed)
```

Edit `data/master.yaml` with your real career data, then `data/targets/example.yaml` (or add
new targets) to build a resume for a specific job. `cvops lint` exits non-zero on any
error-level finding — that's what CI (`.github/workflows/ci.yml`) runs on every push.

Plan, decisions and what would reopen them: [docs/PLAN.md](docs/PLAN.md). ATS layout rules and
the full L1-L10 rule list: [.claude/rules/ats-compliance.md](.claude/rules/ats-compliance.md).
