"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { ApiError, ApplyResult, Basics, BuildResult, DraftMaster, applyImport, buildTarget, createDraft, getMaster, pdfUrl } from "@/lib/api";
import { btn, cta, glass, mesh } from "@/lib/glass";
import { collapse, ease, rise, stagger } from "@/lib/fx/presets";
import { Field, Module, Sec, patch } from "@/lib/ui";

// Build a resume from scratch. The form is turned into a draft and applied through the same path as
// an uploaded resume: merged additively into master, a target is written, the PDF is built.

type Job = { id: string; title: string; company: string; start: string; end: string; bullets: string };
type Edu = { id: string; school: string; degree: string; start: string; end: string };

const SECTIONS = ["basics", "summary", "skills", "experience", "education"] as const;

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const isHttp = (s: string) => /^https?:\/\//i.test(s);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const span = (start: string, end: string, open = "") =>
  start ? (end || open ? `${start} – ${end || open}` : start) : end;
const counts = (c: Record<string, number>) =>
  Object.entries(c).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing";

export default function Builder() {
  // Contact details belong to the master profile: a merge never changes them, so they are read from
  // there (shown, not edited) rather than typed here and silently ignored.
  const [b, setB] = useState<Basics>({ name: "", email: "", phone: "", location: null, links: [] });
  const [masterError, setMasterError] = useState<string | null>(null);
  useEffect(() => {
    getMaster()
      .then((m) => setB(m.basics))
      .catch((e) => setMasterError(e instanceof ApiError ? e.message : "backend unreachable"));
  }, []);
  const [summary, setSummary] = useState("");
  const [skills, setSkills] = useState("");
  const [jobs, setJobs] = useState<Job[]>([{ id: "job-1", title: "", company: "", start: "", end: "", bullets: "" }]);
  const [edus, setEdus] = useState<Edu[]>([{ id: "edu-1", school: "", degree: "", start: "", end: "" }]);

  const [slug, setSlug] = useState("my-resume");
  const [maxPages, setMaxPages] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [done, setDone] = useState<{ applied: ApplyResult; built: BuildResult | null; buildError: string | null } | null>(null);

  const skillList = skills.split(",").map((s) => s.trim()).filter(Boolean);
  const shownJobs = jobs.filter((j) => j.title || j.company);
  const shownEdus = edus.filter((e) => e.school || e.degree);
  const slugOk = SLUG.test(slug);

  // The builder's form in the shape of a draft. Ids only need to be unique here: merge gives new
  // entries collision-free ids of their own.
  const toDraft = (): DraftMaster => ({
    basics: b,
    summaries: summary.trim() ? [{ id: "sum-main", text: summary.trim(), tags: [] }] : [],
    skills: skillList.map((name, i) => ({ id: `sk-${i + 1}`, name, category: null, tags: [], aliases: [] })),
    experience: shownJobs.map((j, i) => ({
      id: `exp-${i + 1}`, company: j.company.trim(), title: j.title.trim(), location: null,
      start: j.start, end: j.end || null,
      bullets: lines(j.bullets).map((text, k) => ({ id: `exp-${i + 1}-${k + 1}`, text, tags: [] })),
    })),
    projects: [],
    education: shownEdus.map((e, i) => ({
      id: `edu-${i + 1}`, institution: e.school.trim(), degree: e.degree.trim(), field: null, location: null,
      start: e.start || null, end: e.end || null, details: [],
    })),
    certifications: [],
  });

  async function build() {
    setBusy(true);
    setError(null);
    setProblems([]);
    setDraftId(null);
    setDone(null);
    try {
      const draft = await createDraft(toDraft(), "Resume builder");
      if (draft.problems.length > 0) {
        setProblems(draft.problems);
        setDraftId(draft.id); // the draft is saved: it can be fixed in the review editor
        return;
      }
      const applied = await applyImport(draft.id, slug, maxPages);
      try {
        setDone({ applied, built: await buildTarget(applied.slug), buildError: null });
      } catch (e) {
        setDone({ applied, built: null, buildError: e instanceof ApiError ? e.message : "build failed" });
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "build failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={mesh}>
      <motion.div variants={rise} initial="hidden" animate="show" className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">ATS Resume Builder</h1>
        <Link href="/" className={btn}>Dashboard</Link>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* LEFT: glass controls */}
        <motion.div variants={stagger} initial="hidden" animate="show" className="min-w-0 space-y-4">
          <motion.div variants={rise} className={`${glass} space-y-3 p-4`}>
            <h2 className="text-base font-semibold text-white">Build resume</h2>
            <p className="text-xs text-slate-300">
              Adds what is new to your master profile (existing entries are untouched), creates a resume that selects
              exactly this content, and builds its PDF.
            </p>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <Field label="Resume name (lowercase, digits, hyphens)" value={slug} onChange={setSlug} placeholder="my-resume" />
              <Field label="Max pages" type="number" value={String(maxPages)} onChange={(v) => setMaxPages(Math.max(1, Number(v) || 1))} />
            </div>
            {!slugOk && slug !== "" && <p className="text-xs text-red-200">Use lowercase letters, digits and single hyphens.</p>}
            <button
              type="button"
              onClick={build}
              disabled={busy || !slugOk}
              aria-busy={busy}
              className={`${cta} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {busy ? "Building..." : "Build resume"}
            </button>
            <div aria-live="polite" className="space-y-2 text-sm text-slate-100">
              {error && <p className="whitespace-pre-line text-red-200 [overflow-wrap:anywhere]">{error}</p>}
              {problems.length > 0 && (
                <div className="text-red-200">
                  <p>{problems.length} field{problems.length === 1 ? "" : "s"} to fix before this can be built:</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 [overflow-wrap:anywhere]">
                    {problems.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                  {draftId && <Link href={`/imports/${draftId}`} className={`${btn} mt-2 inline-block`}>Fix in the review editor</Link>}
                </div>
              )}
              {done && (
                <div className="space-y-2">
                  <p>
                    Added to master: {counts(done.applied.added)}. Already there: {counts(done.applied.already_present)}.
                    Created resume <span className="font-mono">{done.applied.slug}</span>.
                  </p>
                  {done.built && (
                    <p className={done.built.lint_ok ? "text-emerald-200" : "text-red-200"}>
                      {done.built.lint_ok ? "Lint OK" : "Lint failed"} &middot; {(done.built.pdf_bytes / 1024).toFixed(0)} KB
                      &middot; {done.built.errors.length} error{done.built.errors.length === 1 ? "" : "s"} &middot; {done.built.warnings.length} warning{done.built.warnings.length === 1 ? "" : "s"}
                    </p>
                  )}
                  {done.buildError && <p className="text-red-200 [overflow-wrap:anywhere]">The resume was created but the build failed: {done.buildError}</p>}
                  <div className="flex flex-wrap gap-2">
                    {done.built && <a href={pdfUrl(done.applied.slug)} target="_blank" rel="noopener noreferrer" className={btn}>Open PDF</a>}
                    <Link href="/" className={btn}>See it on the dashboard</Link>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          <motion.nav variants={rise} aria-label="Form sections" className={`${glass} flex flex-wrap gap-2 p-3`}>
            {SECTIONS.map((s) => (
              <a key={s} href={`#${s}`} className={`${btn} capitalize`}>{s}</a>
            ))}
          </motion.nav>

          <Module id="basics" title="Basics">
            <p className="text-sm text-slate-200">
              Contact details come from your master profile, so every resume you build shares them. To change them, edit{" "}
              <span className="font-mono">data/master.yaml</span>.
            </p>
            {masterError ? (
              <p role="alert" className="text-sm text-red-200 [overflow-wrap:anywhere]">
                Can&apos;t read the master profile ({masterError}). Building needs it.
              </p>
            ) : (
              <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                {([["Name", b.name], ["Email", b.email], ["Phone", b.phone], ["Location", b.location ?? ""]] as const).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-slate-300">{k}</dt>
                    <dd className="text-white [overflow-wrap:anywhere]">{v || "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Module>

          <Module id="summary" title="Summary">
            <Field label="Professional summary" rows={4} value={summary} onChange={setSummary} />
          </Module>

          <Module id="skills" title="Skills">
            <Field label="Skills (comma-separated)" rows={3} value={skills} onChange={setSkills} placeholder="Python, FastAPI, PostgreSQL" />
          </Module>

          <Module id="experience" title="Experience">
            <AnimatePresence initial={false}>
            {jobs.map((j, i) => (
              <motion.fieldset key={j.id} {...collapse} className="space-y-3 rounded-xl border border-white/20 p-3">
                <legend className="px-1 text-sm font-medium text-slate-100">Role {i + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Job title" value={j.title} onChange={(v) => setJobs(patch(jobs, j.id, { title: v }))} />
                  <Field label="Company" value={j.company} onChange={(v) => setJobs(patch(jobs, j.id, { company: v }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start" type="month" value={j.start} onChange={(v) => setJobs(patch(jobs, j.id, { start: v }))} placeholder="2021-03" />
                  <Field label="End (blank = present)" type="month" value={j.end} onChange={(v) => setJobs(patch(jobs, j.id, { end: v }))} placeholder="2023-08" />
                </div>
                <Field label="Bullets (one per line)" rows={5} value={j.bullets} onChange={(v) => setJobs(patch(jobs, j.id, { bullets: v }))} />
                <button type="button" className={btn} onClick={() => setJobs(jobs.filter((x) => x.id !== j.id))}>
                  Remove role {i + 1}
                </button>
              </motion.fieldset>
            ))}
            </AnimatePresence>
            <button
              type="button"
              className={btn}
              onClick={() => setJobs([...jobs, { id: crypto.randomUUID(), title: "", company: "", start: "", end: "", bullets: "" }])}
            >
              Add role
            </button>
          </Module>

          <Module id="education" title="Education">
            <AnimatePresence initial={false}>
            {edus.map((e, i) => (
              <motion.fieldset key={e.id} {...collapse} className="space-y-3 rounded-xl border border-white/20 p-3">
                <legend className="px-1 text-sm font-medium text-slate-100">Education {i + 1}</legend>
                <Field label="School" value={e.school} onChange={(v) => setEdus(patch(edus, e.id, { school: v }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Degree" value={e.degree} onChange={(v) => setEdus(patch(edus, e.id, { degree: v }))} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Start" type="month" value={e.start} onChange={(v) => setEdus(patch(edus, e.id, { start: v }))} placeholder="2014-09" />
                    <Field label="End" type="month" value={e.end} onChange={(v) => setEdus(patch(edus, e.id, { end: v }))} placeholder="2018-06" />
                  </div>
                </div>
                <button type="button" className={btn} onClick={() => setEdus(edus.filter((x) => x.id !== e.id))}>
                  Remove education {i + 1}
                </button>
              </motion.fieldset>
            ))}
            </AnimatePresence>
            <button
              type="button"
              className={btn}
              onClick={() => setEdus([...edus, { id: crypto.randomUUID(), school: "", degree: "", start: "", end: "" }])}
            >
              Add education
            </button>
          </Module>
        </motion.div>

        {/* RIGHT: ATS layer -- solid white, single column, no glass/transparency/charts.
            min-w-0 + overflow-wrap:anywhere = "Long Token Wrapping"; no overflow-hidden anywhere. */}
        <motion.section
          aria-label="Live preview"
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, ease: ease.out, delay: 0.15 }}
          className="min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto"
        >
          <article className="min-w-0 rounded-sm bg-white p-5 text-slate-900 shadow-xl [overflow-wrap:anywhere] sm:p-8">
            <header>
              <h2 className="text-2xl font-bold">{b.name || "Your name"}</h2>
              <address className="mt-1 space-y-0.5 text-sm not-italic">
                {b.email && (
                  <p>Email: <a href={`mailto:${b.email}`} className="underline">{b.email}</a></p>
                )}
                {b.phone && <p>Phone: {b.phone}</p>}
                {b.location && <p>Location: {b.location}</p>}
                {b.links.filter((l) => l.url).map((l, i) => (
                  <p key={i}>
                    {l.label}: {isHttp(l.url) ? <a href={l.url} className="underline">{l.url}</a> : l.url}
                  </p>
                ))}
              </address>
            </header>

            {summary.trim() && (
              <Sec title="Summary"><p className="text-sm">{summary}</p></Sec>
            )}

            {skillList.length > 0 && (
              <Sec title="Skills"><p className="text-sm">{skillList.join(", ")}</p></Sec>
            )}

            {shownJobs.length > 0 && (
              <Sec title="Experience">
                {shownJobs.map((j) => (
                  <div key={j.id} className="mt-3 first:mt-0">
                    <h4 className="font-semibold">{[j.title, j.company].filter(Boolean).join(", ")}</h4>
                    {span(j.start, j.end, "Present") && <p className="text-sm">{span(j.start, j.end, "Present")}</p>}
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                      {lines(j.bullets).map((l, k) => <li key={k}>{l}</li>)}
                    </ul>
                  </div>
                ))}
              </Sec>
            )}

            {shownEdus.length > 0 && (
              <Sec title="Education">
                {shownEdus.map((e) => (
                  <div key={e.id} className="mt-3 first:mt-0">
                    <h4 className="font-semibold">{[e.degree, e.school].filter(Boolean).join(", ")}</h4>
                    {span(e.start, e.end) && <p className="text-sm">{span(e.start, e.end)}</p>}
                  </div>
                ))}
              </Sec>
            )}
          </article>
        </motion.section>
      </div>
    </div>
  );
}
