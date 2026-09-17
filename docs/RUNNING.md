# Running CVOps

Everything needed to set up, run, and use this project day to day. For *why* it's built this
way, see [docs/PLAN.md](PLAN.md); for the ATS layout rules, see
[.claude/rules/ats-compliance.md](../.claude/rules/ats-compliance.md).

## 1. Prerequisites

- **[uv](https://docs.astral.sh/uv/)** — package manager and Python version manager. Installs
  Python 3.12 for you if you don't have it.
- **`pdftotext`** (poppler-utils) on `PATH` — `cvops lint`'s round-trip check (rule L1) runs it
  as a second, independent text extractor alongside `pdfplumber`, so a single library's parsing
  quirk can't hide a real failure.
  - macOS: `brew install poppler`
  - Debian/Ubuntu (and CI): `apt-get install poppler-utils`

Nothing else is required — no LaTeX, no Node, no database. Typst itself comes as the `typst`
PyPI package (`typst-py`), installed by `uv sync` like any other dependency.

## 2. First-time setup

```bash
git clone <repo-url> CVOps && cd CVOps
uv sync --all-groups        # installs typst, pydantic, pdfplumber, typer, pytest, ruff, ...
uv run pytest                # sanity check: should be all green (see Troubleshooting if not)
```

`uv sync` creates `.venv/` (gitignored) and resolves exact versions into `uv.lock` (committed —
don't hand-edit it; `uv add`/`uv sync` maintain it).

Every command below is meant to be run as `uv run <command>`, which uses `.venv` automatically
without you needing to activate it.

## 3. The data model — what you actually edit

```
data/
  master.yaml            # the ONE source of truth: every role, bullet, skill you have,
                          # each with a stable id (exp-acme-01, sk-fastapi, ...) that never
                          # changes once a target references it
  targets/<slug>.yaml     # one file per job application: a SELECTION and ORDERING over
                          # master's ids, plus optional `overrides` for one-off rewording
  jds/<slug>.md           # the job description text, referenced from a target's `jd:` field
```

`data/master.yaml` and `data/targets/example.yaml` ship with placeholder example data so the
commands below work out of the box. **Replace `data/master.yaml` with your own real career
data before using this for an actual application** — nothing in this tool invents or embellishes
content; it only ever selects, orders, and (if you explicitly write an `override`) rewords what
you put in `master.yaml`.

A target's text can differ from master only through `overrides:` — and every override shows up
as a warning in `cvops lint` (rule L9), so drift from your source of truth is never silent.

## 4. Commands

| Command | What it does |
| --- | --- |
| `uv run cvops build [<slug>\|--all]` | Compiles `data/master.yaml` + `data/targets/<slug>.yaml` → `out/<slug>.pdf` (and keeps the intermediate `out/<slug>.typ` alongside it). |
| `uv run cvops lint [<slug>\|--all]` | Builds, then runs rules L1–L10 against the PDF (round-trip, reading order, single-column, standard headings, labelled contact info, embedded/tagged fonts, no images, page count, provenance, content hygiene). Exits non-zero on any error — this is what CI runs on every push. |
| `uv run cvops show <slug>` | Prints the *resolved* resume (exactly what the template will render, with every bullet's master id attached) as JSON. Useful for debugging what a target actually selects. |
| `uv run cvops match <slug> [--jd <path>]` | Scores a target's keyword coverage against its job description: buckets into present / present-as-alias / missing-from-target / missing, weighted by whether the JD called it required or nice-to-have. |
| `uv run cvops tailor <jd-path> <new-slug>` | Proposes a new target from `master.yaml` + a JD: selects and orders bullets/skills by tag overlap. Never writes an `override` — review the diff, edit by hand, then build/lint it like any other target. |
| `uv run pytest` | Full unit test suite (fast — synthesizes its own test PDFs, so it doesn't need a real Typst compile). |
| `uv run ruff check .` / `uv run ruff format .` | Lint / format the Python source. |

## 5. Day-to-day workflow: applying to a job

```bash
# 1. Save the JD text
$EDITOR data/jds/acme-backend.md

# 2. Get a starting target (selection + ordering only — nothing invented)
uv run cvops tailor data/jds/acme-backend.md acme-backend

# 3. Review data/targets/acme-backend.yaml like a code diff. Reorder, trim, or add an
#    `overrides:` entry by hand if you want different wording than master.yaml has.

# 4. Compile and check
uv run cvops build acme-backend
uv run cvops lint  acme-backend
uv run cvops match acme-backend      # anything still "missing" or "missing from target"?

# 5. Submit out/acme-backend.pdf. Then log what actually happened in the portal:
$EDITOR docs/ats-field-tests.md
```

`docs/ats-field-tests.md` is the ground-truth log: lint proves the PDF is *parseable*, only a
real portal's import/autofill flow proves it parses *the way that portal parses*. Any field
that fails there becomes a new lint rule or a template fix, not just a note in the log.

## 6. CI

`.github/workflows/ci.yml` runs on every push: installs `uv` + `poppler-utils`, `uv sync
--all-groups`, `ruff check`/`ruff format --check`, `pytest`, then `cvops build --all` and `cvops
lint --all` against every target under `data/targets/`, uploading the compiled PDFs as build
artifacts. A red CI run means a target you committed would fail ATS parsing — treat it like a
failing test suite.

## 7. Optional: graphify (codebase knowledge graph)

`.claude/rules/context.md` documents a discovery policy for **graphify**, a third-party
tree-sitter-based tool (not part of this repo, not a Claude plugin) that maps the codebase into
`graphify-out/` for faster AI-assisted exploration. To install it:

```bash
uv tool install graphifyy
cd CVOps
graphify install && graphify hook install   # installs the git hook that keeps it current
```

Not required to build, lint, or use CVOps — it only helps an AI assistant explore the codebase
faster.

## Troubleshooting

- **`MissingToolError: pdftotext not found on PATH`** — poppler-utils isn't installed; see
  §1. This is the single most common first-run failure.
- **`typst-py does not support reproducible/UA builds`** — your `typst` package predates 0.14;
  `uv sync` should already pin a compatible version via `uv.lock`, but if you've hand-edited
  `pyproject.toml`, run `uv lock --upgrade-package typst` then `uv sync`.
- **A lint `L3` (single column) false positive** — the template right-aligns dates with
  `#h(1fr)`, which is expected and specifically excluded; a real hit means something in the
  template or an override is producing genuinely misaligned text. Check `out/<slug>.typ`.
- **`ruff`/`pytest` "command not found"** — you're not inside `uv run`; either prefix every
  command with `uv run`, or `source .venv/bin/activate` first.
- **Fonts/tags**: `cvops build` output is PDF/UA-1 by default (`--no-ua` to turn it off).
  Verify with `pdfinfo out/<slug>.pdf` — it should report `Tagged: yes`.
