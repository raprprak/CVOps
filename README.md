# CVOps

Resume-as-code for one person. A master career-data file and per-job "targets" are compiled
deterministically into ATS-safe PDFs (Typst), linted the way CI tests code, and scored for
keyword coverage against a job description.

```
uv sync                      # installs typst-py, pdfplumber, typer, ...
uv run cvops build --all     # data/master.yaml + data/targets/*.yaml -> out/*.pdf
uv run cvops lint  <slug>    # parse-fidelity + provenance rules (L1-L10)
uv run cvops match <slug>    # JD keyword coverage report
```

Plan, decisions and what would reopen them: [docs/PLAN.md](docs/PLAN.md).
