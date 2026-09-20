"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { ApiError, ImportSummary, listImports, uploadResume } from "@/lib/api";
import { btn, glass, mesh, motion as tx } from "@/lib/glass";
import { ParticleMorph, ease, rise, spring, stagger } from "@/lib/fx";

type Pending = { key: string; name: string; error?: string };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function Spinner() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M17.5 10a7.5 7.5 0 0 0-7.5-7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ImportCard({ r, i }: { r: ImportSummary; i: number }) {
  const counts: [string, number][] = [
    ["roles", r.roles],
    ["bullets", r.bullets],
    ["skills", r.skills],
    ["projects", r.projects],
    ["education", r.education],
    ["certifications", r.certifications],
  ];
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{
        opacity: 1, y: 0, scale: 1,
        transition: { duration: 0.45, ease: ease.out, delay: Math.min(i, 8) * 0.05 },
      }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2, ease: ease.in } }}
      transition={{ layout: spring }}
      whileHover={{ y: -3 }}
      className={`${glass} min-w-0 space-y-3 p-4`}
    >
      <div>
        <h3 className="font-mono text-base font-semibold text-white [overflow-wrap:anywhere]">{r.filename}</h3>
        <p className="text-sm text-slate-200">
          {r.name || "Name not found"} &middot; {fmt(r.imported_at)}
        </p>
      </div>
      <ul className="flex flex-wrap gap-1.5 text-xs text-slate-100">
        {counts.map(([label, n]) => (
          <li key={label} className="rounded-full bg-white/10 px-2.5 py-0.5">
            {n} {label}
          </li>
        ))}
      </ul>
      {r.applied_at && (
        <p className="text-sm text-emerald-200">Applied to master {fmt(r.applied_at)}</p>
      )}
      <Link href={`/imports/${r.id}`} className={`${btn} inline-block`}>Review &amp; edit</Link>
      {r.problems.length > 0 && (
        <details className="text-sm text-red-200">
          <summary className={`cursor-pointer rounded ${tx} hover:text-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white`}>
            {r.problems.length} field{r.problems.length === 1 ? "" : "s"} to fix before this can be applied
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 [overflow-wrap:anywhere]">
            {r.problems.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </details>
      )}
      {r.warnings.length > 0 && (
        <details className="text-sm text-amber-200">
          <summary className={`cursor-pointer rounded ${tx} hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white`}>
            {r.warnings.length} parser warning{r.warnings.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 [overflow-wrap:anywhere]">
            {r.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </details>
      )}
    </motion.li>
  );
}

export default function Upload() {
  const [imports, setImports] = useState<ImportSummary[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const busy = pending.some((p) => !p.error);

  useEffect(() => {
    listImports()
      .then(setImports)
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : "backend unreachable"));
  }, []);

  async function handle(files: FileList | File[]) {
    // One at a time: parsing is quick and this keeps the list order and errors easy to follow.
    for (const file of Array.from(files)) {
      const key = crypto.randomUUID();
      setPending((p) => [...p, { key, name: file.name }]);
      try {
        const r = await uploadResume(file);
        setImports((i) => [r, ...i]);
        setPending((p) => p.filter((x) => x.key !== key));
      } catch (e) {
        const error = e instanceof ApiError ? e.message : "upload failed";
        setPending((p) => p.map((x) => (x.key === key ? { ...x, error } : x)));
      }
    }
  }

  return (
    <div className={mesh}>
      <motion.main variants={stagger} initial="hidden" animate="show" className="mx-auto max-w-[1200px] space-y-6">
        <motion.header variants={rise} className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-white">Upload resumes</h1>
            <p className="text-sm text-slate-200">
              Each file is parsed into a draft. Nothing touches your master profile until you apply it.
            </p>
          </div>
          <Link href="/" className={btn}>Dashboard</Link>
        </motion.header>

        <motion.label
          variants={rise}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}
          className={`${glass} flex cursor-pointer flex-col items-center gap-4 border-dashed p-6 text-center transition-colors duration-200 motion-reduce:transition-none hover:bg-white/15 focus-within:ring-2 focus-within:ring-white sm:flex-row sm:text-left ${
            over ? "border-orange-300 bg-white/20" : ""
          }`}
        >
          <div className="flex min-w-0 flex-1 flex-col items-center gap-2 sm:items-start">
            <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-slate-100" aria-hidden="true">
              <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-base font-semibold text-white">
              {over ? "Release to upload" : "Drop resumes here, or click to choose"}
            </span>
            <span className="text-sm text-slate-200">PDF or DOCX, up to 5 MB each. Several files at once are fine.</span>
            <input
              type="file"
              multiple
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) handle(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          {/* decorative: the page becomes a globe while a file is dragged over, and pulses while parsing */}
          <ParticleMorph morphed={over} loop={busy} className="pointer-events-none h-36 w-full sm:h-40 sm:w-64" />
        </motion.label>

        <div aria-live="polite" className="space-y-2">
          <AnimatePresence initial={false}>
          {pending.map((p) => (
            <motion.p
              key={p.key}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.25, ease: ease.out }}
              className={`${glass} flex flex-wrap items-center gap-2 px-4 py-2 text-sm ${p.error ? "border-red-300/40 text-red-200" : "text-slate-100"}`}
            >
              {!p.error && <Spinner />}
              <span className="font-mono [overflow-wrap:anywhere]">{p.name}</span>
              <span>{p.error ? `-- ${p.error}` : "-- parsing..."}</span>
              {p.error && (
                <button type="button" className={`${btn} ml-auto`} onClick={() => setPending((all) => all.filter((x) => x.key !== p.key))}>
                  Dismiss
                </button>
              )}
            </motion.p>
          ))}
          </AnimatePresence>
        </div>

        {loadError && (
          <motion.p variants={rise} role="alert" className={`${glass} border-red-300/40 px-4 py-3 text-sm text-red-200`}>
            Can&apos;t reach the CVOps API at localhost:8000 -- is it running? ({loadError})
          </motion.p>
        )}

        <motion.section variants={rise} aria-labelledby="imports-h">
          <h2 id="imports-h" className="mb-3 text-lg font-semibold text-white">Imported drafts</h2>
          {imports.length === 0 ? (
            <p className={`${glass} p-4 text-sm text-slate-100`}>No resumes imported yet.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence>
                {imports.map((r, i) => <ImportCard key={r.id} r={r} i={i} />)}
              </AnimatePresence>
            </ul>
          )}
        </motion.section>
      </motion.main>
    </div>
  );
}
