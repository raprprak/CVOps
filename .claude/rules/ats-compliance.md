# ATS compliance & recruiter-ranking rules

Domain rules the compile pipeline (`render.py`) and linter (`ats_lint.py`) must enforce/check. This is what makes a compiled resume "ATS-safe" rather than just a PDF.

## Layout rules (enforce in LaTeX templates)
- Single-column layout only. No `minipage`, no side-by-side columns, no sidebars — ATS parsers read strictly left-to-right; columns interleave text into gibberish.
- Map ligatures to Unicode: `\input{glyphtounicode}` + `\pdfgentounicode=1` in the LaTeX preamble, so "fi"/"fl"/"ff" extract as real text, not custom glyphs.
- No icon-only contact info (FontAwesome glyphs etc. without accompanying text) — parsers ignore or misread icons. Always pair an icon with the literal word ("Email:", "Phone:").
- Standard section headings only: Experience, Education, Technical Skills, Projects — parsers dictionary-match section titles; nonstandard headings get miscategorized or dropped.

## Linter checks (`ats_lint.py` — implement as automated tests per compiled resume)
- **Notepad test**: extract text from the compiled PDF and verify it flows top-to-bottom in reading order with no interleaving/missing words — the automated equivalent of the manual Ctrl+A/paste-into-notepad check.
- Flag detected multi-column artifacts, missing/nonstandard section headings, or icon-adjacent text with no literal label.

## Ranking guidance (feeds `match.py` / content suggestions — not hard linter failures)
- Mirror exact JD keyword strings — don't paraphrase ("FastAPI" stays "FastAPI", not "Python web frameworks").
- Technical Skills section should sit high in the document (parsers weight early content more).
- Bullet points should quantify impact: `Accomplished [X], as measured by [Y], by doing [Z].`

## Prior art
Reference these before designing `render.py` / `match.py` — don't reinvent what they've already solved:
- **RenderCV** (17k+ stars) — YAML resume source compiled via Typst/LaTeX to a tagged, text-selectable PDF. Closest existing analog to CVOps's render pipeline.
- **Resume-Matcher** (srbhr) — Python, local vector-based keyword matching between resume and JD. Closest existing analog to CVOps's `match.py`.
- **OpenResume** (xitanggg) — local-first React single-column visual editor targeting Greenhouse/Lever parsing.
- **resume-as-code** (silverbeer) — local career-history file + LLM-driven JD targeting ("GitOps for your job search").
- **ats-resume-agent** (NullSpace-BitCradle) — Claude Code agent: CLI interview → career data → JD-targeted LLM optimization → LaTeX, with a zero-fabrication policy.
- **ResumeSkills** (Paramchoudhary) / **ats-optimized-resume-agent-skill** (SankaiAI) — agent-skill approaches to ATS keyword optimization in editors.

Worth skimming RenderCV's templates and Resume-Matcher's matching approach specifically before implementation.
