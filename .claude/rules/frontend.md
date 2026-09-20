# Frontend rules (Next.js / TypeScript) — PARKED

`frontend/` is a Next.js scaffold kept in the repo but receiving no work (decision 06 in `docs/PLAN.md`): CVOps is a personal CLI and the value is in the pipeline. Don't add features, dependencies or API calls here. If decision 01 (single user) changes, re-enter via a thin API over `src/cvops/services/` and then apply the conventions below.

## Tooling (when un-parked)
- Package manager: npm (as scaffolded). App Router (`src/app/`), TypeScript strict, Tailwind CSS. Lint: `npm run lint`.

## Conventions (when un-parked)
- All backend calls through one typed client (`src/lib/api.ts`); base URL via `NEXT_PUBLIC_API_URL`.
- Server Components by default; `"use client"` only for real interactivity.
- TypeScript resume types mirror the Pydantic models in `src/cvops/models/` — when one changes, check the other.

## Design
- For any UI change in `frontend/`, consult the **ui-ux-pro-max** skill first (`--domain ux`, `--stack nextjs`; `--design-system` only for a new page). Keep colours as semantic tokens in `src/app/globals.css`, never raw hex in components.
