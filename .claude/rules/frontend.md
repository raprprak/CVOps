# Frontend rules (Next.js / TypeScript)

`frontend/` is the web app over the API in `src/cvops/api/app.py` (decision 06 in `docs/PLAN.md`): dashboard (`/`), upload and review/edit of imported resumes (`/upload`, `/imports/[id]`), builder (`/builder`) and the original tabbed tool (`/workspace`). Next 16, React 19, Tailwind 4, `motion`, `three`.

## Before writing code
- Next 16 has breaking changes: read the relevant guide in `frontend/node_modules/next/dist/docs/` first (see `frontend/AGENTS.md`).
- For any UI change consult the **ui-ux-pro-max** skill first (`--domain ux`, `--stack nextjs`; `--design-system` only for a new page). The design system is `design-system/<project>/MASTER.md` plus `pages/` overrides: Glassmorphism, dark; the resume preview sheet stays opaque white (ATS).

## Tooling
- npm, App Router (`src/app/`), TypeScript strict, Tailwind. Checks: `npm run lint`, `npx tsc --noEmit`, `npm run build` (`next build` and `next dev` use separate output folders, so they can run together).

## Conventions
- All backend calls go through the typed client `src/lib/api.ts`; the API base URL is a constant there (`http://localhost:8000`). Its types mirror the API's Pydantic models: when one changes, check the other.
- Pages are client components (they fetch on mount and hold form state); the root layout stays a Server Component.
- Shared glass classes: `src/lib/glass.ts`. Shared widgets: `src/lib/ui.tsx` (`Field`, `Module`, `ActionMenu`). `glass.ts` exports a transition-class string named `motion`; where you also need `motion/react`, import it as `motion as tx`.
- Motion lives in `src/lib/fx/` and imports nothing from the app, so it can move to its own package: particle morph, `DotsMorph`, `VelocityGallery`, `presets.ts` (durations, easing, stagger/rise/collapse), `FxProvider` (reduced motion, mounted in the root layout). Use the presets, honour reduced motion, prefer transform/opacity (the `collapse` preset is the one deliberate height animation).
- three.js is reached only through the lazy `ParticleMorph` export (`next/dynamic`, `ssr: false`); `shapes.ts` and `presets.ts` must stay free of `three` so they don't enter the main bundle.
- Colours: semantic tokens or the Tailwind palette, never raw hex in components.
- Check UI changes in a real browser (Playwright) against mocked API responses, not the real backend, so no personal data is loaded.
