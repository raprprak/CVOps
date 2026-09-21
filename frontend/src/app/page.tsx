"use client";

import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import { ApiError, Overview, TargetInfo, buildTarget, deleteTarget, getOverview, pdfUrl } from "@/lib/api";
import { btn, glass } from "@/lib/glass";
import { pop, rise, stagger } from "@/lib/fx";
import { PageHeader, StartOptions, Steps } from "@/lib/flow";
import { ActionMenu } from "@/lib/ui";

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path d="M4 10.5l3.5 3.5L16 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path d="M10 6v5M10 14h.01M3 10a7 7 0 1 1 14 0 7 7 0 0 1-14 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The number is a motion value: it is written straight to the DOM each frame (no React re-render),
// so the count stays smooth. Colour glows orange while it moves.
function Stat({ label, value }: { label: string; value: number }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const shown = useTransform(mv, Math.round);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const c = animate(mv, value, {
      duration: reduce ? 0 : 0.9,
      ease: "easeOut",
      onPlay: () => setMoving(true),
      onComplete: () => setMoving(false),
    });
    return () => c.stop();
  }, [mv, value, reduce]);
  return (
    <motion.div variants={pop} whileHover={{ y: -3 }} className={`${glass} p-3`}>
      <dt className="text-sm text-slate-200">{label}</dt>
      <motion.dd
        animate={{ color: moving ? "#fdba74" : "#ffffff" }}
        transition={{ duration: 0.3 }}
        className="mt-0.5 text-2xl font-semibold tabular-nums"
      >
        {shown}
      </motion.dd>
    </motion.div>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 3v5h5M8.5 13h7M8.5 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OpenIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M11 4h5v5M16 4l-7 7M8 5H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2">
      <dt className="text-xs text-slate-300">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums text-white">{value}</dd>
    </div>
  );
}

function ResumeCard({
  t, onDeleted, onRefreshed,
}: {
  t: TargetInfo;
  onDeleted: (slug: string, o: Overview) => void;
  onRefreshed: (o: Overview) => void;
}) {
  return (
    // rises in with the list, lifts on hover, slides into gaps (layout) and fades out on delete
    <motion.li
      layout
      variants={rise}
      whileHover={{ y: -4 }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.25 } }}
      transition={{ layout: { type: "spring", stiffness: 300, damping: 34 } }}
      className={`${glass} flex min-w-0 flex-col gap-4 p-5`}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-linear-to-br from-blue-500/40 to-orange-500/40 text-white">
          <DocIcon />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-mono text-base font-semibold text-white [overflow-wrap:anywhere]">{t.slug}</h3>
          <p className="text-sm text-slate-300">
            {t.version ? `${t.version}${t.updated ? ` · ${fmt(t.updated)}` : ""}` : "Uncommitted"}
          </p>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            t.valid ? "bg-emerald-400/15 text-emerald-200" : "bg-red-400/15 text-red-200"
          }`}
        >
          {t.valid ? <CheckIcon /> : <AlertIcon />}
          {t.valid ? "Valid" : "Invalid"}
        </span>
      </div>

      {t.valid ? (
        <dl className="grid grid-cols-3 gap-2">
          <Metric label="Bullets" value={t.bullets} />
          <Metric label="Skills" value={t.skills} />
          <Metric label="Max pages" value={t.max_pages} />
        </dl>
      ) : (
        <p className="whitespace-pre-line text-sm text-red-200 [overflow-wrap:anywhere]">{t.problem}</p>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-white/15 pt-4 text-sm text-slate-200">
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${t.built_at ? "bg-emerald-400" : "bg-amber-400"}`} aria-hidden="true" />
          {t.built_at
            ? `PDF built ${fmt(t.built_at)} · ${Math.round((t.pdf_bytes ?? 0) / 1024)} KB`
            : "PDF not built yet"}
        </span>
      </div>

      <ActionMenu
        leading={
          t.built_at ? (
            <a
              href={pdfUrl(t.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className={`${btn} inline-flex flex-1 items-center justify-center gap-2`}
            >
              <OpenIcon />
              Open PDF
            </a>
          ) : (
            <button
              type="button"
              disabled
              title="Not built yet: Manage, then Rebuild PDF"
              className={`${btn} inline-flex flex-1 items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <OpenIcon />
              Open PDF
            </button>
          )
        }
        items={[
          {
            label: "Tailor to a job",
            hint: "match keywords",
            to: `/tailor?resume=${t.slug}`,
          },
          {
            label: "Rebuild PDF",
            hint: "build & lint",
            disabled: !t.valid,
            onSelect: async () => {
              const r = await buildTarget(t.slug);
              onRefreshed(await getOverview());
              return r.lint_ok
                ? "Built · lint OK"
                : `Built · lint failed (${r.errors.length} error${r.errors.length === 1 ? "" : "s"})`;
            },
          },
          {
            label: "Delete version",
            danger: true,
            confirm: "Delete this version? Files move to data/.trash.",
            onSelect: async () => {
              const { overview } = await deleteTarget(t.slug);
              onDeleted(t.slug, overview);
            },
          },
        ]}
      />
    </motion.li>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOverview()
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "backend unreachable"));
  }, []);

  const count = data?.targets.length ?? 0;
  // How far along the three-step workflow this person is, from what exists: any resume = step 1
  // done; any built PDF = step 2 done. Tailoring can't be detected, so step 3 is never "done".
  const done = count === 0 ? 0 : data?.targets.some((t) => t.built_at) ? 2 : 1;

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Your resumes"
        subtitle={
          data && count === 0
            ? "You have not made a resume yet. Start below."
            : "Every version you have built. Open a PDF, tailor one to a job, or start a new resume."
        }
      />

      {error && (
        <p role="alert" className={`${glass} border-red-300/40 px-4 py-3 text-sm text-red-200`}>
          Can&apos;t reach the CVOps API at localhost:8000 -- is it running? ({error})
        </p>
      )}
      {!data && !error && <p aria-busy="true" className="text-sm text-slate-200">Loading...</p>}

      {data && count === 0 && (
        // Empty state: say why it is empty, show what to do, and show what comes after.
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-8">
          <motion.section variants={rise} aria-labelledby="start-h" className="space-y-4">
            <div>
              <h2 id="start-h" className="text-xl font-semibold text-white">Let&apos;s make your first resume</h2>
              <p className="text-base text-slate-200">Choose how to start. You check everything before it is saved.</p>
            </div>
            <StartOptions />
          </motion.section>
          <motion.section variants={rise} aria-labelledby="how-h" className="space-y-3">
            <h2 id="how-h" className="text-lg font-semibold text-white">How it works</h2>
            <Steps current={1} />
          </motion.section>
        </motion.div>
      )}

      {data && count > 0 && (
        // Mounted when the data lands, so it staggers in then: tiles pop, cards rise.
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-8">
          <motion.details variants={rise} open={done < 2} className={`${glass} group`}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-base font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white [&::-webkit-details-marker]:hidden">
              How it works
              <span className="text-sm font-normal text-slate-300">{done} of 3 steps done</span>
            </summary>
            <div className="px-4 pb-4">
              <Steps done={done} current={Math.min(done + 1, 3) as 1 | 2 | 3} />
            </div>
          </motion.details>

          <section aria-labelledby="career-h">
            <h2 id="career-h" className="text-lg font-semibold text-white">Your career data</h2>
            <p className="mb-3 text-sm text-slate-200">
              {data.master.name} &middot; what your {count} resume{count === 1 ? "" : "s"} draw on
            </p>
            <motion.dl variants={stagger} className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <Stat label="Resumes" value={count} />
              <Stat label="Roles" value={data.master.roles} />
              <Stat label="Bullets" value={data.master.bullets} />
              <Stat label="Skills" value={data.master.skills} />
              <Stat label="Projects" value={data.master.projects} />
              <Stat label="Education" value={data.master.education} />
              <Stat label="Certifications" value={data.master.certifications} />
            </motion.dl>
          </section>

          <section aria-labelledby="resumes-h">
            <h2 id="resumes-h" className="text-lg font-semibold text-white">Resume versions</h2>
            <p className="mb-3 text-sm text-slate-200">
              Each version selects content from your career data and builds to an ATS-safe PDF.
            </p>
            <motion.ul variants={stagger} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence>
                {data.targets.map((t) => (
                  <ResumeCard
                    key={t.slug}
                    t={t}
                    onRefreshed={setData}
                    // One state update: the tiles get their new numbers (and count to them) while
                    // the card fades out and its siblings slide into place.
                    onDeleted={(slug, o) =>
                      setData((d) => d && { master: o.master, targets: d.targets.filter((x) => x.slug !== slug) })
                    }
                  />
                ))}
              </AnimatePresence>
            </motion.ul>
          </section>
        </motion.div>
      )}
    </div>
  );
}
