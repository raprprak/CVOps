"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  BuildResult,
  MatchResult,
  ResolvedResume,
  TailorResult,
  buildTarget,
  getTarget,
  listTargets,
  matchTarget,
  pdfUrl,
  tailorTarget,
} from "@/lib/api";

type Tab = "overview" | "build" | "match" | "tailor";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "build", label: "Build & Lint" },
  { id: "match", label: "Match" },
  { id: "tailor", label: "Tailor" },
];

// -- tiny inline icons (no icon library) ------------------------------------------

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path d="M4 10.5l3.5 3.5L16 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path d="M10 6v5M10 14h.01M3 10a7 7 0 1 1 14 0 7 7 0 0 1-14 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M17.5 10a7.5 7.5 0 0 0-7.5-7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground " +
  "placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const buttonClass =
  "inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground " +
  "cursor-pointer transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function ErrorBanner({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <ErrorIcon />
      {message}
    </p>
  );
}

export default function Home() {
  const [targets, setTargets] = useState<string[] | null>(null);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [slug, setSlug] = useState<string>("");
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    listTargets()
      .then((ts) => {
        setTargets(ts);
        if (ts.length > 0) setSlug(ts[0]);
      })
      .catch((e) => setTargetsError(e instanceof ApiError ? e.message : "backend unreachable"));
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h1 className="font-mono text-lg font-semibold tracking-tight">CVOps</h1>
          <p className="text-xs text-muted-foreground">resume-as-code</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="target-select" className="text-xs text-muted-foreground">
            Target
          </label>
          <select
            id="target-select"
            className={`${inputClass} w-auto font-mono`}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={!targets || targets.length === 0}
          >
            {!targets && <option>loading...</option>}
            {targets?.length === 0 && <option>no targets found</option>}
            {targets?.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </header>

      {targetsError && (
        <div className="px-6 pt-4">
          <ErrorBanner message={`Can't reach the CVOps API at localhost:8000 -- is it running? (${targetsError})`} />
        </div>
      )}

      <nav className="flex gap-1 border-b border-border px-6" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`cursor-pointer border-b-2 px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              tab === t.id
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 px-6 py-6">
        {!slug ? (
          <p className="text-sm text-muted-foreground">
            {targets ? "No targets yet -- propose one from the Tailor tab." : "Loading targets..."}
          </p>
        ) : (
          <>
            {tab === "overview" && <OverviewPanel key={slug} slug={slug} />}
            {tab === "build" && <BuildPanel key={slug} slug={slug} />}
            {tab === "match" && <MatchPanel slug={slug} />}
            {tab === "tailor" && <TailorPanel onProposed={() => listTargets().then(setTargets)} />}
          </>
        )}
      </main>
    </div>
  );
}

// -- Overview ----------------------------------------------------------------------

function OverviewPanel({ slug }: { slug: string }) {
  const [resume, setResume] = useState<ResolvedResume | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `key={slug}` on this component (see Home) remounts it on target change, so state
  // starts fresh -- no need to reset it here too.
  useEffect(() => {
    getTarget(slug)
      .then(setResume)
      .catch((e) => setError(e instanceof ApiError ? e.message : "failed to load"));
  }, [slug]);

  if (error) return <ErrorBanner message={error} />;
  if (!resume) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="font-mono text-sm font-semibold text-muted-foreground">Basics</h2>
        <p className="mt-2 text-base font-medium">{resume.basics.name}</p>
        <p className="text-sm text-muted-foreground">
          {resume.basics.email} &middot; {resume.basics.phone}
          {resume.basics.location ? ` · ${resume.basics.location}` : ""}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Sections</dt>
            <dd className="font-mono">{resume.sections.join(", ")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Max pages</dt>
            <dd className="font-mono">{resume.max_pages}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Skills</dt>
            <dd className="font-mono">{resume.skills.length}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Experience entries</dt>
            <dd className="font-mono">{resume.experience.length}</dd>
          </div>
        </dl>
      </section>

      {resume.summary && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-mono text-sm font-semibold text-muted-foreground">Summary</h2>
          <p className="mt-2 text-sm">{resume.summary.text}</p>
        </section>
      )}

      <section className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
        <h2 className="font-mono text-sm font-semibold text-muted-foreground">Skills</h2>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {resume.skills.map((s) => (
            <li key={s.id} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
              {s.name}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
        <h2 className="font-mono text-sm font-semibold text-muted-foreground">Experience</h2>
        <ul className="mt-2 space-y-3">
          {resume.experience.map((exp) => (
            <li key={exp.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
              <p className="text-sm font-medium">
                {exp.title} <span className="text-muted-foreground">&middot; {exp.company}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {exp.dates}
                {exp.location ? ` · ${exp.location}` : ""} &middot; {exp.bullets.length} bullet
                {exp.bullets.length === 1 ? "" : "s"}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// -- Build & Lint --------------------------------------------------------------------

function BuildPanel({ slug }: { slug: string }) {
  const [result, setResult] = useState<BuildResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [buildCount, setBuildCount] = useState(0);

  // `key={slug}` on this component (see Home) remounts it on target change, so no
  // reset-on-slug-change effect is needed here.

  async function onBuild() {
    setLoading(true);
    setError(null);
    try {
      const r = await buildTarget(slug);
      setResult(r);
      setBuildCount((n) => n + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "build failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBuild} disabled={loading} aria-busy={loading} className={buttonClass}>
        {loading ? <Spinner /> : null}
        {loading ? "Building..." : "Build & lint"}
      </button>

      <div aria-live="polite" className="space-y-4">
        {error && <ErrorBanner message={error} />}

        {result && (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
              <span
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  result.lint_ok ? "bg-accent/15 text-accent" : "bg-destructive/15 text-destructive"
                }`}
              >
                {result.lint_ok ? <CheckIcon /> : <ErrorIcon />}
                {result.lint_ok ? "Lint OK" : "Lint failed"}
              </span>
              <span className="text-sm text-muted-foreground">
                {(result.pdf_bytes / 1024).toFixed(0)} KB &middot; {result.errors.length} error
                {result.errors.length === 1 ? "" : "s"} &middot; {result.warnings.length} warning
                {result.warnings.length === 1 ? "" : "s"}
              </span>
              <a
                href={pdfUrl(slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-sm text-accent underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                Open PDF in new tab
              </a>
            </div>

            {result.errors.length > 0 && (
              <ul className="space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
                    <ErrorIcon />
                    {e}
                  </li>
                ))}
              </ul>
            )}
            {result.warnings.length > 0 && (
              <ul className="space-y-1">
                {result.warnings.map((w, i) => (
                  <li key={i} className="rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground">
                    {w}
                  </li>
                ))}
              </ul>
            )}

            <iframe
              key={buildCount}
              title={`${slug} resume PDF preview`}
              src={`${pdfUrl(slug)}#toolbar=0`}
              className="h-[70vh] w-full rounded-lg border border-border bg-white"
            />
          </>
        )}
      </div>
    </div>
  );
}

// -- Match ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  missing: "Missing",
  missing_from_target: "Missing from target",
  present_as_alias: "Present (alias)",
  present: "Present",
};

const STATUS_CLASS: Record<string, string> = {
  missing: "bg-destructive/15 text-destructive",
  missing_from_target: "bg-destructive/10 text-destructive/80",
  present_as_alias: "bg-muted text-muted-foreground",
  present: "bg-accent/15 text-accent",
};

function MatchPanel({ slug }: { slug: string }) {
  const [jd, setJd] = useState("");
  const [result, setResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onCheck() {
    setLoading(true);
    setError(null);
    try {
      setResult(await matchTarget(slug, jd));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "match failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <label htmlFor="jd-text" className="mb-1 block text-sm font-medium">
          Job description
        </label>
        <textarea
          id="jd-text"
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          rows={8}
          className={inputClass}
          placeholder="Paste the job description here"
        />
      </div>
      <button type="button" onClick={onCheck} disabled={loading || !jd.trim()} aria-busy={loading} className={buttonClass}>
        {loading ? <Spinner /> : null}
        {loading ? "Checking..." : "Check match"}
      </button>

      <div aria-live="polite" className="space-y-3">
        {error && <ErrorBanner message={error} />}
        {result && (
          <>
            <p className="text-sm">
              Score: <span className="font-mono text-base font-semibold">{Math.round(result.score * 100)}%</span>
            </p>
            <ul className="space-y-1">
              {result.lines.map((l, i) => (
                <li key={i} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[l.status]}`}>
                    {STATUS_LABEL[l.status]}
                  </span>
                  <span className="font-mono">{l.term}</span>
                  <span className="text-xs text-muted-foreground">({l.section})</span>
                  {l.note && <span className="ml-auto truncate text-xs text-muted-foreground">{l.note}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

// -- Tailor --------------------------------------------------------------------------

function TailorPanel({ onProposed }: { onProposed: () => void }) {
  const [jd, setJd] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [maxPages, setMaxPages] = useState(1);
  const [force, setForce] = useState(false);
  const [result, setResult] = useState<TailorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onPropose() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await tailorTarget(jd, newSlug, maxPages, force);
      setResult(r);
      onProposed();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "tailor failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <label htmlFor="tailor-jd" className="mb-1 block text-sm font-medium">
          Job description
        </label>
        <textarea
          id="tailor-jd"
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          rows={8}
          className={inputClass}
          placeholder="Paste the job description here"
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="new-slug" className="mb-1 block text-sm font-medium">
            New target slug
          </label>
          <input
            id="new-slug"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            placeholder="acme-backend"
            className={`${inputClass} w-56 font-mono`}
          />
        </div>
        <div>
          <label htmlFor="max-pages" className="mb-1 block text-sm font-medium">
            Max pages
          </label>
          <input
            id="max-pages"
            type="number"
            min={1}
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value) || 1)}
            className={`${inputClass} w-24`}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border-border focus-visible:ring-2 focus-visible:ring-ring"
          />
          Overwrite if it already exists
        </label>
      </div>
      <button
        type="button"
        onClick={onPropose}
        disabled={loading || !jd.trim() || !newSlug.trim()}
        aria-busy={loading}
        className={buttonClass}
      >
        {loading ? <Spinner /> : null}
        {loading ? "Proposing..." : "Propose target"}
      </button>

      <div aria-live="polite">
        {error && <ErrorBanner message={error} />}
        {result && (
          <p className="flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
            <CheckIcon />
            Wrote <span className="font-mono">{result.wrote}</span> -- review the diff, then build & lint it.
          </p>
        )}
      </div>
    </div>
  );
}
