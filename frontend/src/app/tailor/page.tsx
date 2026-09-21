"use client";

import { AnimatePresence, motion } from "motion/react";
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

import { btn, cta, field, glass } from "@/lib/glass";
import { NextStep, PageHeader, Steps } from "@/lib/flow";

type Tab = "match" | "tailor" | "build" | "overview";

// In the order you'd use them: compare with a job, make a version for it, then build and inspect.
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "match", label: "Match a job", hint: "Paste a job description to see which of its keywords this resume already covers." },
  { id: "tailor", label: "Create tailored version", hint: "Paste the job description and name the new version. It picks the most relevant roles and bullets from your career data; nothing is rewritten." },
  { id: "build", label: "Build & check", hint: "Build this version's PDF and run the ATS checks on it." },
  { id: "overview", label: "Content", hint: "What this version currently contains." },
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

const inputClass = `${field} [&>option]:text-slate-900`;

const buttonClass = `${cta} inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50`;

function ErrorBanner({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-center gap-2 rounded-md border border-red-300/40 bg-red-400/10 px-3 py-2 text-sm text-red-200">
      <ErrorIcon />
      {message}
    </p>
  );
}

export default function Home() {
  const [targets, setTargets] = useState<string[] | null>(null);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [slug, setSlug] = useState<string>("");
  const [tab, setTab] = useState<Tab>("match");

  useEffect(() => {
    listTargets()
      .then((ts) => {
        setTargets(ts);
        // ?resume=<slug> (from a dashboard card) picks the version; otherwise the first one.
        const want = new URLSearchParams(window.location.search).get("resume");
        setSlug(want && ts.includes(want) ? want : (ts[0] ?? ""));
        if (ts.length === 0) setTab("tailor"); // nothing to compare yet: creating one is the useful tab
      })
      .catch((e) => setTargetsError(e instanceof ApiError ? e.message : "backend unreachable"));
  }, []);

  const current = TABS.find((t) => t.id === tab) ?? TABS[0];
  const needsResume = tab !== "tailor"; // tailoring works from your career data; the rest need a version

  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <PageHeader
        crumbs={[{ label: "Resumes", href: "/" }, { label: "Tailor to a job" }]}
        title="Tailor to a job"
        subtitle="Compare a resume with a job description, see which keywords are missing, then create a version made for that job."
      />

      {targetsError && (
        <ErrorBanner message={`Can't reach the CVOps API at localhost:8000 -- is it running? (${targetsError})`} />
      )}

      <div className={`${glass} flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3`}>
        <label htmlFor="target-select" className="text-sm font-medium text-slate-100">
          Resume version
        </label>
        <select
          id="target-select"
          style={{ width: "18rem", maxWidth: "100%" }}
          className={`${inputClass} font-mono`}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          disabled={!targets || targets.length === 0}
        >
          {!targets && <option>loading...</option>}
          {targets?.length === 0 && <option>no resumes yet</option>}
          {targets?.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-300">The comparison and any new version start from this resume.</span>
      </div>

      <nav className={`${glass} flex flex-wrap gap-1 px-3`} aria-label="Tailoring steps">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`relative cursor-pointer px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
              tab === t.id ? "text-white" : "text-slate-300 hover:text-white"
            }`}
          >
            {t.label}
            {/* one underline that slides between tabs */}
            {tab === t.id && (
              <motion.span
                layoutId="tab-underline"
                className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-orange-400"
                transition={{ type: "spring", stiffness: 400, damping: 36 }}
              />
            )}
          </button>
        ))}
      </nav>
      <p className="px-1 text-sm text-slate-200">{current.hint}</p>

      <div>
        {needsResume && !slug ? (
          <div className={`${glass} space-y-3 p-5`}>
            <p className="text-base text-slate-100">
              {targets ? "You need a resume first: tailoring starts from one you have already made." : "Loading resumes..."}
            </p>
            {targets && <NextStep href="/new">Make a resume</NextStep>}
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {tab === "overview" && <OverviewPanel key={slug} slug={slug} />}
              {tab === "build" && <BuildPanel key={slug} slug={slug} />}
              {tab === "match" && <MatchPanel slug={slug} />}
              {tab === "tailor" && (
                <TailorPanel
                  onProposed={() => listTargets().then(setTargets)}
                  onBuild={(s) => {
                    setSlug(s);
                    setTab("build");
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <Steps current={3} />
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
  if (!resume) return <p className="text-sm text-slate-300">Loading...</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={`${glass} p-4`}>
        <h2 className="font-mono text-sm font-semibold text-slate-300">Basics</h2>
        <p className="mt-2 text-base font-medium">{resume.basics.name}</p>
        <p className="text-sm text-slate-300">
          {resume.basics.email} &middot; {resume.basics.phone}
          {resume.basics.location ? ` · ${resume.basics.location}` : ""}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-slate-300">Sections</dt>
            <dd className="font-mono">{resume.sections.join(", ")}</dd>
          </div>
          <div>
            <dt className="text-slate-300">Max pages</dt>
            <dd className="font-mono">{resume.max_pages}</dd>
          </div>
          <div>
            <dt className="text-slate-300">Skills</dt>
            <dd className="font-mono">{resume.skills.length}</dd>
          </div>
          <div>
            <dt className="text-slate-300">Experience entries</dt>
            <dd className="font-mono">{resume.experience.length}</dd>
          </div>
        </dl>
      </section>

      {resume.summary && (
        <section className={`${glass} p-4`}>
          <h2 className="font-mono text-sm font-semibold text-slate-300">Summary</h2>
          <p className="mt-2 text-sm">{resume.summary.text}</p>
        </section>
      )}

      <section className={`${glass} p-4 lg:col-span-2`}>
        <h2 className="font-mono text-sm font-semibold text-slate-300">Skills</h2>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {resume.skills.map((s) => (
            <li key={s.id} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-slate-300">
              {s.name}
            </li>
          ))}
        </ul>
      </section>

      <section className={`${glass} p-4 lg:col-span-2`}>
        <h2 className="font-mono text-sm font-semibold text-slate-300">Experience</h2>
        <ul className="mt-2 space-y-3">
          {resume.experience.map((exp) => (
            <li key={exp.id} className="border-b border-white/20 pb-3 last:border-0 last:pb-0">
              <p className="text-sm font-medium">
                {exp.title} <span className="text-slate-300">&middot; {exp.company}</span>
              </p>
              <p className="text-xs text-slate-300">
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
            <div className={`flex flex-wrap items-center gap-3 ${glass} p-4`}>
              <span
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  result.lint_ok ? "bg-emerald-400/15 text-emerald-200" : "bg-red-400/15 text-red-200"
                }`}
              >
                {result.lint_ok ? <CheckIcon /> : <ErrorIcon />}
                {result.lint_ok ? "Lint OK" : "Lint failed"}
              </span>
              <span className="text-sm text-slate-300">
                {(result.pdf_bytes / 1024).toFixed(0)} KB &middot; {result.errors.length} error
                {result.errors.length === 1 ? "" : "s"} &middot; {result.warnings.length} warning
                {result.warnings.length === 1 ? "" : "s"}
              </span>
              <a
                href={pdfUrl(slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-sm text-sky-200 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
              >
                Open PDF in new tab
              </a>
            </div>

            {result.errors.length > 0 && (
              <ul className="space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="flex gap-2 rounded-md border border-red-300/40 bg-red-400/10 px-3 py-1.5 text-sm text-red-200">
                    <ErrorIcon />
                    {e}
                  </li>
                ))}
              </ul>
            )}
            {result.warnings.length > 0 && (
              <ul className="space-y-1">
                {result.warnings.map((w, i) => (
                  <li key={i} className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-slate-300">
                    {w}
                  </li>
                ))}
              </ul>
            )}

            <iframe
              key={buildCount}
              title={`${slug} resume PDF preview`}
              src={`${pdfUrl(slug)}#toolbar=0`}
              className="h-[70vh] w-full rounded-lg border border-white/20 bg-white"
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
  missing: "bg-red-400/15 text-red-200",
  missing_from_target: "bg-red-400/10 text-red-200/80",
  present_as_alias: "bg-white/10 text-slate-300",
  present: "bg-emerald-400/15 text-emerald-200",
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
                <li key={i} className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm backdrop-blur-md">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[l.status]}`}>
                    {STATUS_LABEL[l.status]}
                  </span>
                  <span className="font-mono">{l.term}</span>
                  <span className="text-xs text-slate-300">({l.section})</span>
                  {l.note && <span className="ml-auto truncate text-xs text-slate-300">{l.note}</span>}
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

function TailorPanel({ onProposed, onBuild }: { onProposed: () => void; onBuild: (slug: string) => void }) {
  const [jd, setJd] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [maxPages, setMaxPages] = useState(1);
  const [force, setForce] = useState(false);
  const [result, setResult] = useState<TailorResult | null>(null);
  const [wroteSlug, setWroteSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onPropose() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await tailorTarget(jd, newSlug, maxPages, force);
      setResult(r);
      setWroteSlug(newSlug);
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
            className="h-4 w-4 cursor-pointer rounded accent-orange-500 focus-visible:ring-2 focus-visible:ring-white"
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
          <div className="space-y-2 rounded-md border border-emerald-300/40 bg-emerald-400/10 px-3 py-3 text-sm text-emerald-200">
            <p className="flex items-center gap-2">
              <CheckIcon />
              Created <span className="font-mono">{result.wrote}</span>. Next: build its PDF and check it.
            </p>
            <button type="button" onClick={() => onBuild(wroteSlug)} className={`${btn} inline-flex items-center gap-2 text-slate-50`}>
              Build &amp; check it <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
