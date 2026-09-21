"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ReactNode, useEffect, useState } from "react";
import {
  ApiError, ApplyResult, BuildResult, DraftMaster, DraftText, ImportDraft,
  applyImport, buildTarget, getImport, pdfUrl, saveImport,
} from "@/lib/api";
import { btn, cta, glass } from "@/lib/glass";
import { NextStep, PageHeader, Steps } from "@/lib/flow";
import { collapse, ease, rise, stagger } from "@/lib/fx/presets";
import { Field, Module, Sec, patch } from "@/lib/ui";

const SECTIONS = ["basics", "summary", "skills", "experience", "projects", "education", "certifications"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Ids for things added in the editor; same charset the schema requires (lowercase, digits, hyphens).
const rid = () => crypto.randomUUID().slice(0, 6);
const isHttp = (s: string) => /^https?:\/\//i.test(s);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugify = (filename: string) =>
  filename.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "imported-resume";
const counts = (c: Record<string, number>) =>
  Object.entries(c).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing";

function ym(s: string) {
  const [y, m] = s.split("-");
  return MONTHS[Number(m) - 1] ? `${MONTHS[Number(m) - 1]} ${y}` : s;
}

function range(start: string | null, end: string | null) {
  if (start) return `${ym(start)} – ${end ? ym(end) : "Present"}`;
  return end ? ym(end) : "";
}

// -- editing widgets -----------------------------------------------------------------

function Bullets({
  label, items, onChange, parent,
}: { label: string; items: DraftText[]; onChange: (v: DraftText[]) => void; parent: string }) {
  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
      {items.map((b, i) => (
        <motion.div key={b.id} {...collapse} className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Field label={`${label} ${i + 1}`} rows={2} value={b.text} onChange={(v) => onChange(patch(items, b.id, { text: v }))} />
          </div>
          <button
            type="button"
            className={`${btn} self-end`}
            aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
            onClick={() => onChange(items.filter((x) => x.id !== b.id))}
          >
            Remove
          </button>
        </motion.div>
      ))}
      </AnimatePresence>
      <button type="button" className={btn} onClick={() => onChange([...items, { id: `${parent}-${rid()}`, text: "", tags: [] }])}>
        Add {label.toLowerCase()}
      </button>
    </div>
  );
}

function Entry({ title, onRemove, children }: { title: string; onRemove: () => void; children: ReactNode }) {
  return (
    <motion.fieldset {...collapse} className="space-y-3 rounded-xl border border-white/20 p-3">
      <legend className="px-1 text-sm font-medium text-slate-100">{title}</legend>
      {children}
      <button type="button" className={btn} onClick={onRemove}>Remove {title.toLowerCase()}</button>
    </motion.fieldset>
  );
}

// -- ATS preview: solid white, single column, no glass (same rules as /builder) -------

function Sheet({ m }: { m: DraftMaster }) {
  const b = m.basics;
  const groups = new Map<string, string[]>();
  for (const s of m.skills) {
    if (s.name) groups.set(s.category ?? "", [...(groups.get(s.category ?? "") ?? []), s.name]);
  }
  const roles = m.experience.filter((e) => e.title || e.company);
  const projects = m.projects.filter((p) => p.name);
  const edus = m.education.filter((e) => e.institution || e.degree);
  const certs = m.certifications.filter((c) => c.name);
  const bullets = (items: DraftText[]) => (
    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
      {items.filter((x) => x.text).map((x) => <li key={x.id}>{x.text}</li>)}
    </ul>
  );

  return (
    <article className="min-w-0 rounded-sm bg-white p-5 text-slate-900 shadow-xl [overflow-wrap:anywhere] sm:p-8">
      <header>
        <h2 className="text-2xl font-bold">{b.name}</h2>
        <address className="mt-1 space-y-0.5 text-sm not-italic">
          {b.email && <p>Email: <a href={`mailto:${b.email}`} className="underline">{b.email}</a></p>}
          {b.phone && <p>Phone: {b.phone}</p>}
          {b.location && <p>Location: {b.location}</p>}
          {b.links.filter((l) => l.url).map((l, i) => (
            <p key={i}>
              {l.label}: {isHttp(l.url) ? <a href={l.url} className="underline">{l.url}</a> : l.url}
            </p>
          ))}
        </address>
      </header>

      {m.summaries[0]?.text && <Sec title="Summary"><p className="text-sm">{m.summaries[0].text}</p></Sec>}

      {groups.size > 0 && (
        <Sec title="Skills">
          {[...groups].map(([cat, names]) => (
            <p key={cat} className="text-sm">{cat ? `${cat}: ` : ""}{names.join(", ")}</p>
          ))}
        </Sec>
      )}

      {roles.length > 0 && (
        <Sec title="Experience">
          {roles.map((e) => (
            <div key={e.id} className="mt-3 first:mt-0">
              <h4 className="font-semibold">{[e.title, e.company].filter(Boolean).join(", ")}</h4>
              {(e.location || e.start) && <p className="text-sm">{[e.location, range(e.start, e.end)].filter(Boolean).join(" · ")}</p>}
              {bullets(e.bullets)}
            </div>
          ))}
        </Sec>
      )}

      {projects.length > 0 && (
        <Sec title="Projects">
          {projects.map((p) => (
            <div key={p.id} className="mt-3 first:mt-0">
              <h4 className="font-semibold">{p.name}</h4>
              {p.url && <p className="text-sm">{p.url}</p>}
              {bullets(p.bullets)}
            </div>
          ))}
        </Sec>
      )}

      {edus.length > 0 && (
        <Sec title="Education">
          {edus.map((e) => (
            <div key={e.id} className="mt-3 first:mt-0">
              <h4 className="font-semibold">{[e.degree, e.field, e.institution].filter(Boolean).join(", ")}</h4>
              {(e.location || e.start || e.end) && <p className="text-sm">{[e.location, range(e.start, e.end)].filter(Boolean).join(" · ")}</p>}
              {bullets(e.details)}
            </div>
          ))}
        </Sec>
      )}

      {certs.length > 0 && (
        <Sec title="Certifications">
          {certs.map((c) => (
            <p key={c.id} className="text-sm">{[c.name, c.issuer, c.date && ym(c.date)].filter(Boolean).join(", ")}</p>
          ))}
        </Sec>
      )}
    </article>
  );
}

// -- page -----------------------------------------------------------------------------

export default function ReviewImport() {
  const { id } = useParams<{ id: string }>();
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [m, setM] = useState<DraftMaster | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [maxPages, setMaxPages] = useState(2);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<ApplyResult | null>(null);
  const [build, setBuild] = useState<BuildResult | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);

  useEffect(() => {
    getImport(id)
      .then((d) => {
        setDraft(d);
        setM(d.master);
        setProblems(d.problems);
        setSlug(slugify(d.filename));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "backend unreachable"));
  }, [id]);

  const edit = (fn: (cur: DraftMaster) => DraftMaster) => {
    setM((cur) => (cur ? fn(cur) : cur));
    setDirty(true);
  };
  const set = <K extends keyof DraftMaster>(key: K, value: DraftMaster[K]) =>
    edit((cur) => ({ ...cur, [key]: value }));
  const setBasics = (p: Partial<DraftMaster["basics"]>) =>
    edit((cur) => ({ ...cur, basics: { ...cur.basics, ...p } }));

  async function save() {
    if (!m) return;
    setSaving(true);
    setError(null);
    try {
      const d = await saveImport(id, m);
      setProblems(d.problems);
      setDirty(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  async function apply() {
    if (!m) return;
    setApplying(true);
    setError(null);
    setApplied(null);
    setBuild(null);
    setBuildError(null);
    try {
      if (dirty) {
        const d = await saveImport(id, m);
        setProblems(d.problems);
        setDirty(false);
        if (d.problems.length > 0) {
          setError("Fix the fields listed above before applying.");
          return;
        }
      }
      const r = await applyImport(id, slug, maxPages);
      setApplied(r);
      setDraft((d) => (d ? { ...d, applied_at: new Date().toISOString() } : d));
      try {
        setBuild(await buildTarget(r.slug));
      } catch (e) {
        setBuildError(e instanceof ApiError ? e.message : "build failed");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "apply failed");
    } finally {
      setApplying(false);
    }
  }

  const slugOk = SLUG.test(slug);

  return (
    <div>
      <div className="mx-auto max-w-[1400px]">
        <PageHeader
          crumbs={[{ label: "Resumes", href: "/" }, { label: "New resume", href: "/new" }, { label: "Upload", href: "/upload" }, { label: "Review" }]}
          title="Review & edit"
          subtitle={
            draft ? (
              <>
                Check what we read from <span className="font-mono [overflow-wrap:anywhere]">{draft.filename}</span>, fix anything
                that is wrong, then press <strong>Apply &amp; build</strong> to create your resume.
              </>
            ) : (
              "Check what we read from your file, fix anything that is wrong, then apply it to create your resume."
            )
          }
        />
        <div className="mb-6">
          <Steps current={2} done={1} />
        </div>

        {error && (
          <motion.p
            role="alert"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: ease.out }}
            className={`${glass} mb-4 whitespace-pre-line border-red-300/40 px-4 py-3 text-sm text-red-200 [overflow-wrap:anywhere]`}
          >
            {error}
          </motion.p>
        )}
        {!m && !error && <p aria-busy="true" className="text-sm text-slate-200">Loading...</p>}

        {draft && m && (
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <motion.div variants={stagger} initial="hidden" animate="show" className="min-w-0 space-y-4">
              <motion.div variants={rise} className={`${glass} space-y-3 p-4`}>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving || !dirty}
                    aria-busy={saving}
                    className={`${cta} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    Save draft
                  </button>
                  <span aria-live="polite" className="text-sm text-slate-100">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={saving ? "saving" : dirty ? "dirty" : "saved"}
                        className="inline-block"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                      >
                        {saving ? "Saving..." : dirty ? "Unsaved changes" : "Saved"}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                </div>
                {problems.length > 0 && (
                  <details open className="text-sm text-red-200">
                    <summary className="cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                      {problems.length} field{problems.length === 1 ? "" : "s"} to fix before this can be applied
                    </summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 [overflow-wrap:anywhere]">
                      {problems.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </details>
                )}
                {draft.warnings.length > 0 && (
                  <details className="text-sm text-amber-200">
                    <summary className="cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                      {draft.warnings.length} parser warning{draft.warnings.length === 1 ? "" : "s"}
                    </summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 [overflow-wrap:anywhere]">
                      {draft.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </details>
                )}
                <p className="text-xs text-slate-300">
                  Problems refresh when you save. This is a draft: nothing here is in your career data until you apply it.
                </p>

                <div className="space-y-3 border-t border-white/20 pt-3">
                  <h2 className="text-base font-semibold text-white">Create the resume</h2>
                  <p className="text-xs text-slate-300">
                    Adds what is new to your career data (nothing you already have is changed),
                    creates a resume that selects exactly this content, and builds its PDF.
                    {draft.applied_at && " This draft was already applied; another name adds a second resume."}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                    <Field label="Resume name (lowercase, digits, hyphens)" value={slug} onChange={setSlug} placeholder="my-resume" />
                    <Field label="Max pages" type="number" value={String(maxPages)} onChange={(v) => setMaxPages(Math.max(1, Number(v) || 1))} />
                  </div>
                  {!slugOk && slug !== "" && <p className="text-xs text-red-200">Use lowercase letters, digits and single hyphens.</p>}
                  <button
                    type="button"
                    onClick={apply}
                    disabled={applying || saving || !slugOk}
                    aria-busy={applying}
                    className={`${cta} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {applying ? "Applying..." : "Apply & build"}
                  </button>
                  <div aria-live="polite" className="space-y-2 text-sm text-slate-100">
                    {applied && (
                      <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: ease.out }}>
                        Added to your career data: {counts(applied.added)}. Already there: {counts(applied.already_present)}.
                        Created resume <span className="font-mono">{applied.slug}</span>.
                      </motion.p>
                    )}
                    {build && (
                      <motion.div
                        className="space-y-2"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: ease.out, delay: 0.1 }}
                      >
                        <p className={build.lint_ok ? "text-emerald-200" : "text-red-200"}>
                          {build.lint_ok ? "Lint OK" : "Lint failed"} &middot; {(build.pdf_bytes / 1024).toFixed(0)} KB
                          &middot; {build.errors.length} error{build.errors.length === 1 ? "" : "s"} &middot; {build.warnings.length} warning{build.warnings.length === 1 ? "" : "s"}
                        </p>
                        {build.errors.length > 0 && (
                          <ul className="list-disc space-y-1 pl-5 text-red-200 [overflow-wrap:anywhere]">
                            {build.errors.map((e, i) => <li key={i}>{e}</li>)}
                          </ul>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <a href={pdfUrl(build.slug)} target="_blank" rel="noopener noreferrer" className={`${btn} inline-block`}>Open PDF</a>
                          <NextStep href={`/tailor?resume=${build.slug}`}>Next: tailor it to a job</NextStep>
                          <Link href="/" className={btn}>See it on the dashboard</Link>
                        </div>
                      </motion.div>
                    )}
                    {buildError && <p className="text-red-200 [overflow-wrap:anywhere]">The resume was created but the build failed: {buildError}</p>}
                  </div>
                </div>
              </motion.div>

              <motion.nav variants={rise} aria-label="Form sections" className={`${glass} flex flex-wrap gap-2 p-3`}>
                {SECTIONS.map((s) => (
                  <a key={s} href={`#${s}`} className={`${btn} capitalize`}>{s}</a>
                ))}
              </motion.nav>

              <Module id="basics" title="Basics">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Full name" value={m.basics.name} onChange={(v) => setBasics({ name: v })} autoComplete="name" />
                  <Field label="Email" type="email" value={m.basics.email} onChange={(v) => setBasics({ email: v })} autoComplete="email" />
                  <Field label="Phone" type="tel" value={m.basics.phone} onChange={(v) => setBasics({ phone: v })} autoComplete="tel" />
                  <Field label="Location" value={m.basics.location ?? ""} onChange={(v) => setBasics({ location: v || null })} />
                </div>
                {m.basics.links.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_2fr]">
                      <Field label={`Link ${i + 1} label`} value={l.label} onChange={(v) => setBasics({ links: m.basics.links.map((x, j) => (j === i ? { ...x, label: v } : x)) })} />
                      <Field label={`Link ${i + 1} URL`} type="url" value={l.url} onChange={(v) => setBasics({ links: m.basics.links.map((x, j) => (j === i ? { ...x, url: v } : x)) })} />
                    </div>
                    <button type="button" className={`${btn} self-end`} aria-label={`Remove link ${i + 1}`} onClick={() => setBasics({ links: m.basics.links.filter((_, j) => j !== i) })}>
                      Remove
                    </button>
                  </div>
                ))}
                <button type="button" className={btn} onClick={() => setBasics({ links: [...m.basics.links, { label: "", url: "" }] })}>
                  Add link
                </button>
              </Module>

              <Module id="summary" title="Summary">
                <Field
                  label="Professional summary"
                  rows={4}
                  value={m.summaries[0]?.text ?? ""}
                  onChange={(v) =>
                    set("summaries", v ? [{ id: m.summaries[0]?.id ?? "sum-main", text: v, tags: m.summaries[0]?.tags ?? [] }] : [])
                  }
                />
              </Module>

              <Module id="skills" title="Skills">
                <AnimatePresence initial={false}>
                {m.skills.map((s, i) => (
                  <motion.div key={s.id} {...collapse} className="flex gap-2">
                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                      <Field label={`Skill ${i + 1}`} value={s.name} onChange={(v) => set("skills", patch(m.skills, s.id, { name: v }))} />
                      <Field label={`Category ${i + 1}`} value={s.category ?? ""} onChange={(v) => set("skills", patch(m.skills, s.id, { category: v || null }))} />
                    </div>
                    <button type="button" className={`${btn} self-end`} aria-label={`Remove skill ${i + 1}`} onClick={() => set("skills", m.skills.filter((x) => x.id !== s.id))}>
                      Remove
                    </button>
                  </motion.div>
                ))}
                </AnimatePresence>
                <button type="button" className={btn} onClick={() => set("skills", [...m.skills, { id: `sk-${rid()}`, name: "", category: null, tags: [], aliases: [] }])}>
                  Add skill
                </button>
              </Module>

              <Module id="experience" title="Experience">
                <AnimatePresence initial={false}>
                {m.experience.map((e, i) => (
                  <Entry key={e.id} title={`Role ${i + 1}`} onRemove={() => set("experience", m.experience.filter((x) => x.id !== e.id))}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Job title" value={e.title} onChange={(v) => set("experience", patch(m.experience, e.id, { title: v }))} />
                      <Field label="Company" value={e.company} onChange={(v) => set("experience", patch(m.experience, e.id, { company: v }))} />
                      <Field label="Location" value={e.location ?? ""} onChange={(v) => set("experience", patch(m.experience, e.id, { location: v || null }))} />
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Start (YYYY-MM)" value={e.start} placeholder="2021-03" onChange={(v) => set("experience", patch(m.experience, e.id, { start: v }))} />
                        <Field label="End (blank = present)" value={e.end ?? ""} placeholder="2023-08" onChange={(v) => set("experience", patch(m.experience, e.id, { end: v || null }))} />
                      </div>
                    </div>
                    <Bullets label="Bullet" parent={e.id} items={e.bullets} onChange={(v) => set("experience", patch(m.experience, e.id, { bullets: v }))} />
                  </Entry>
                ))}
                </AnimatePresence>
                <button type="button" className={btn} onClick={() => set("experience", [...m.experience, { id: `exp-${rid()}`, company: "", title: "", location: null, start: "", end: null, bullets: [] }])}>
                  Add role
                </button>
              </Module>

              <Module id="projects" title="Projects">
                <AnimatePresence initial={false}>
                {m.projects.map((p, i) => (
                  <Entry key={p.id} title={`Project ${i + 1}`} onRemove={() => set("projects", m.projects.filter((x) => x.id !== p.id))}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Name" value={p.name} onChange={(v) => set("projects", patch(m.projects, p.id, { name: v }))} />
                      <Field label="URL" type="url" value={p.url ?? ""} onChange={(v) => set("projects", patch(m.projects, p.id, { url: v || null }))} />
                    </div>
                    <Bullets label="Bullet" parent={p.id} items={p.bullets} onChange={(v) => set("projects", patch(m.projects, p.id, { bullets: v }))} />
                  </Entry>
                ))}
                </AnimatePresence>
                <button type="button" className={btn} onClick={() => set("projects", [...m.projects, { id: `proj-${rid()}`, name: "", url: null, start: null, end: null, bullets: [] }])}>
                  Add project
                </button>
              </Module>

              <Module id="education" title="Education">
                <AnimatePresence initial={false}>
                {m.education.map((e, i) => (
                  <Entry key={e.id} title={`Education ${i + 1}`} onRemove={() => set("education", m.education.filter((x) => x.id !== e.id))}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Institution" value={e.institution} onChange={(v) => set("education", patch(m.education, e.id, { institution: v }))} />
                      <Field label="Degree" value={e.degree} onChange={(v) => set("education", patch(m.education, e.id, { degree: v }))} />
                      <Field label="Field of study" value={e.field ?? ""} onChange={(v) => set("education", patch(m.education, e.id, { field: v || null }))} />
                      <Field label="Location" value={e.location ?? ""} onChange={(v) => set("education", patch(m.education, e.id, { location: v || null }))} />
                      <Field label="Start (YYYY-MM)" value={e.start ?? ""} onChange={(v) => set("education", patch(m.education, e.id, { start: v || null }))} />
                      <Field label="End (YYYY-MM)" value={e.end ?? ""} onChange={(v) => set("education", patch(m.education, e.id, { end: v || null }))} />
                    </div>
                    <Bullets label="Detail" parent={e.id} items={e.details} onChange={(v) => set("education", patch(m.education, e.id, { details: v }))} />
                  </Entry>
                ))}
                </AnimatePresence>
                <button type="button" className={btn} onClick={() => set("education", [...m.education, { id: `edu-${rid()}`, institution: "", degree: "", field: null, location: null, start: null, end: null, details: [] }])}>
                  Add education
                </button>
              </Module>

              <Module id="certifications" title="Certifications">
                <AnimatePresence initial={false}>
                {m.certifications.map((c, i) => (
                  <Entry key={c.id} title={`Certification ${i + 1}`} onRemove={() => set("certifications", m.certifications.filter((x) => x.id !== c.id))}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Name" value={c.name} onChange={(v) => set("certifications", patch(m.certifications, c.id, { name: v }))} />
                      <Field label="Issuer" value={c.issuer ?? ""} onChange={(v) => set("certifications", patch(m.certifications, c.id, { issuer: v || null }))} />
                      <Field label="Date (YYYY-MM)" value={c.date ?? ""} onChange={(v) => set("certifications", patch(m.certifications, c.id, { date: v || null }))} />
                      <Field label="URL" type="url" value={c.url ?? ""} onChange={(v) => set("certifications", patch(m.certifications, c.id, { url: v || null }))} />
                    </div>
                  </Entry>
                ))}
                </AnimatePresence>
                <button type="button" className={btn} onClick={() => set("certifications", [...m.certifications, { id: `cert-${rid()}`, name: "", issuer: null, date: null, url: null }])}>
                  Add certification
                </button>
              </Module>
            </motion.div>

            <motion.section
              aria-label="Live preview"
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.55, ease: ease.out, delay: 0.15 }}
              className="min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto"
            >
              <Sheet m={m} />
            </motion.section>
          </div>
        )}
      </div>
    </div>
  );
}
