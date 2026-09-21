# App shell (every page)

> Overrides `../MASTER.md`. Only deviations and page-specific rules are listed; everything else follows the Master.

- One sticky top bar (blur over the mesh): brand mark + `CVOps`, two destinations (`Resumes`, `Tailor to a job`), and **one** primary orange button, `New resume`. Never three equal-weight buttons.
- The active destination has an animated underline and `aria-current="page"`. Pages in the New-resume flow (`/new`, `/upload`, `/builder`, `/imports/*`) ring the `New resume` button instead.
- The shell owns the only `<main id="main">` and a skip link; pages render inside it and never add another `<main>`.
- Every page opens with `PageHeader`: breadcrumb (only for pages 2+ levels deep), an `h1`, and a one-sentence purpose. Copy says "career data", never "master".
- Workflow indicator `Steps`: 1 Add career data, 2 Review & build, 3 Tailor to a job. Pages mark their step; each ends by offering the next.
