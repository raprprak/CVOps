# Frontend rules (Next.js / TypeScript)

## Tooling
- Package manager: npm (as scaffolded).
- App Router (`src/app/`), TypeScript strict mode, Tailwind CSS.
- Lint: `npm run lint` (eslint-config-next).

## Conventions
- All calls to the backend go through a single typed API client (`src/lib/api.ts`) — no ad-hoc `fetch` calls scattered across components.
- Backend base URL via `NEXT_PUBLIC_API_URL` env var, defaulting to `http://localhost:8000`.
- Server Components by default; add `"use client"` only where real interactivity is needed (form editing, live PDF preview).
- Co-locate feature code under `src/app/<feature>/`; reserve `src/components/` for things shared across features.
- Resume/career-data TypeScript types should mirror the backend's Pydantic models in `backend/src/cvops/models/` — when one changes, check the other.
