"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, Overview, TargetInfo, deleteTarget, getOverview, pdfUrl } from "@/lib/api";
import { btn, cta, glass, mesh } from "@/lib/glass";

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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={`${glass} p-4`}>
      <dt className="text-sm text-slate-200">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold tabular-nums text-white">{value}</dd>
    </div>
  );
}

function ResumeCard({ t, onDeleted }: { t: TargetInfo; onDeleted: (slug: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setErr(null);
    try {
      await deleteTarget(t.slug);
      onDeleted(t.slug);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "backend unreachable");
      setBusy(false);
    }
  };

  return (
    <li className={`${glass} flex min-w-0 flex-col gap-3 p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 font-mono text-base font-semibold text-white [overflow-wrap:anywhere]">{t.slug}</h3>
        <span
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            t.valid ? "bg-emerald-400/15 text-emerald-200" : "bg-red-400/15 text-red-200"
          }`}
        >
          {t.valid ? <CheckIcon /> : <AlertIcon />}
          {t.valid ? "Valid" : "Invalid"}
        </span>
      </div>

      <p className="text-sm text-slate-200">
        {t.version ? `${t.version}${t.updated ? ` · ${fmt(t.updated)}` : ""}` : "Uncommitted"}
      </p>

      {t.valid ? (
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-slate-300">Bullets</dt>
            <dd className="font-semibold tabular-nums">{t.bullets}</dd>
          </div>
          <div>
            <dt className="text-slate-300">Skills</dt>
            <dd className="font-semibold tabular-nums">{t.skills}</dd>
          </div>
          <div>
            <dt className="text-slate-300">Max pages</dt>
            <dd className="font-semibold tabular-nums">{t.max_pages}</dd>
          </div>
        </dl>
      ) : (
        <p className="whitespace-pre-line text-sm text-red-200 [overflow-wrap:anywhere]">{t.problem}</p>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-white/20 pt-3 text-sm text-slate-200">
        <span>
          {t.built_at
            ? `PDF built ${fmt(t.built_at)} · ${Math.round((t.pdf_bytes ?? 0) / 1024)} KB`
            : "PDF not built yet"}
        </span>
        {t.built_at && (
          <a href={pdfUrl(t.slug)} target="_blank" rel="noopener noreferrer" className={btn}>
            Open PDF
          </a>
        )}
      </div>

      {err && <p role="alert" className="text-sm text-red-200 [overflow-wrap:anywhere]">{err}</p>}
      {confirming ? (
        <div role="alertdialog" aria-label={`Delete ${t.slug}`} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-100">Delete this version? Files move to data/.trash.</span>
          <button type="button" onClick={remove} disabled={busy} className={`${btn} border-red-300/50 text-red-200`}>
            {busy ? "Deleting..." : "Yes, delete"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={btn} autoFocus>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={`${btn} self-start text-red-200`}>
          Delete
        </button>
      )}
    </li>
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

  return (
    <div className={mesh}>
      <main className="mx-auto max-w-[1200px] space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-white">CVOps</h1>
            <p className="text-sm text-slate-200">Resume-as-code dashboard</p>
          </div>
          <nav aria-label="Primary" className="flex flex-wrap gap-2">
            <Link href="/upload" className={cta}>Upload resume</Link>
            <Link href="/workspace" className={btn}>Workspace</Link>
            <Link href="/builder" className={btn}>Resume builder</Link>
          </nav>
        </header>

        {error && (
          <p role="alert" className={`${glass} border-red-300/40 px-4 py-3 text-sm text-red-200`}>
            Can&apos;t reach the CVOps API at localhost:8000 -- is it running? ({error})
          </p>
        )}
        {!data && !error && <p aria-busy="true" className="text-sm text-slate-200">Loading...</p>}

        {data && (
          <>
            <section aria-labelledby="master-h">
              <h2 id="master-h" className="text-lg font-semibold text-white">Master profile</h2>
              <p className="mb-3 text-sm text-slate-200">{data.master.name}</p>
              <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Stat label="Resumes" value={data.targets.length} />
                <Stat label="Roles" value={data.master.roles} />
                <Stat label="Bullets" value={data.master.bullets} />
                <Stat label="Skills" value={data.master.skills} />
                <Stat label="Projects" value={data.master.projects} />
                <Stat label="Education" value={data.master.education} />
                <Stat label="Certifications" value={data.master.certifications} />
              </dl>
            </section>

            <section aria-labelledby="resumes-h">
              <h2 id="resumes-h" className="mb-3 text-lg font-semibold text-white">Resumes</h2>
              {data.targets.length === 0 ? (
                <p className={`${glass} p-4 text-sm text-slate-100`}>
                  No resumes yet -- propose one from the Tailor tab in the{" "}
                  <Link href="/workspace" className="underline">workspace</Link>.
                </p>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {data.targets.map((t) => (
                    <ResumeCard
                      key={t.slug}
                      t={t}
                      onDeleted={(slug) =>
                        setData({ ...data, targets: data.targets.filter((x) => x.slug !== slug) })
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
