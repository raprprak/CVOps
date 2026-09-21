"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { btn, cta, glass, mesh } from "@/lib/glass";
import { rise } from "@/lib/fx/presets";

// The app's frame and its workflow vocabulary, so every page answers the same three questions:
// where am I, what is this for, and what do I do next.

// -- icons (inline, decorative) ----------------------------------------------------------

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
const PAGE = "M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM14 3v5h5M8.5 13h7M8.5 17h5";
const UPLOAD = "M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3";
const PEN = "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4";
const PLUS = "M12 5v14M5 12h14";
const CHECK = "M5 12.5l4.5 4.5L19 7";

function LogoMark() {
  return (
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-linear-to-br from-blue-500 to-orange-500 text-white shadow-lg">
      <Icon d={PAGE} className="h-[18px] w-[18px]" />
    </span>
  );
}

// -- app shell -----------------------------------------------------------------------------

const NAV = [
  { href: "/", label: "Resumes" },
  { href: "/tailor", label: "Tailor to a job" },
];
// Pages that belong to the "New resume" flow (its button, not a nav link, is the way in).
const NEW_FLOW = ["/new", "/upload", "/builder", "/imports"];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const inNewFlow = NEW_FLOW.some((p) => path === p || path.startsWith(`${p}/`));
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className={mesh}>
      <a
        href="#main"
        className="sr-only rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/55 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg text-lg font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <LogoMark />
            CVOps
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isActive(n.href) ? "page" : undefined}
                className={`relative rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  isActive(n.href) ? "text-white" : "text-slate-300 hover:text-white"
                }`}
              >
                {n.label}
                {isActive(n.href) && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-orange-400"
                    transition={{ type: "spring", stiffness: 400, damping: 36 }}
                  />
                )}
              </Link>
            ))}
          </nav>
          <Link
            href="/new"
            aria-current={inNewFlow ? "page" : undefined}
            className={`${cta} ml-auto inline-flex items-center gap-2 ${inNewFlow ? "ring-2 ring-white/70" : ""}`}
          >
            <Icon d={PLUS} className="h-4 w-4" />
            New resume
          </Link>
        </div>
      </header>
      <main id="main" className="px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}

// -- page header -----------------------------------------------------------------------------

export function PageHeader({
  title, subtitle, crumbs, actions,
}: {
  title: string;
  subtitle?: ReactNode;
  crumbs?: { label: string; href?: string }[]; // the trail above the title, for pages 2+ levels deep
  actions?: ReactNode;
}) {
  return (
    <motion.header
      variants={rise}
      initial="hidden"
      animate="show"
      className="mb-6 flex flex-wrap items-end justify-between gap-4"
    >
      <div className="min-w-0 space-y-1.5">
        {crumbs && (
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5 text-sm text-slate-300">
              {crumbs.map((c, i) => (
                <li key={c.label} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden="true">/</span>}
                  {c.href ? (
                    <Link href={c.href} className="rounded underline-offset-2 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="text-slate-100">{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="text-2xl font-semibold text-white sm:text-3xl">{title}</h1>
        {subtitle && <p className="max-w-2xl text-base text-slate-200">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </motion.header>
  );
}

// -- the workflow ---------------------------------------------------------------------------

const STEPS = [
  { n: 1, title: "Add your career data", body: "Upload a resume you already have, or build one from scratch." },
  { n: 2, title: "Review & build", body: "Check what was captured, then produce the ATS-safe PDF." },
  { n: 3, title: "Tailor to a job", body: "Match a job description and create a version made for it." },
];

/** The three-step workflow. `current` highlights where this page sits; `done` is how many are complete. */
export function Steps({ current, done = 0 }: { current?: 1 | 2 | 3; done?: number }) {
  return (
    <ol aria-label="How it works" className="grid gap-3 sm:grid-cols-3">
      {STEPS.map((s) => {
        const isDone = s.n <= done;
        const isCurrent = s.n === current;
        return (
          <li
            key={s.n}
            aria-current={isCurrent ? "step" : undefined}
            className={`flex gap-3 rounded-xl border p-3 ${
              isCurrent ? "border-orange-300/60 bg-white/15" : "border-white/15 bg-white/5"
            }`}
          >
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                isDone
                  ? "bg-emerald-400/20 text-emerald-200"
                  : isCurrent
                    ? "bg-orange-600 text-black"
                    : "bg-white/10 text-slate-100"
              }`}
            >
              {isDone ? <Icon d={CHECK} className="h-4 w-4" /> : s.n}
              <span className="sr-only">{isDone ? " (done)" : isCurrent ? " (you are here)" : ""}</span>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{s.title}</p>
              <p className="text-xs text-slate-300">{s.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// -- how to start ---------------------------------------------------------------------------

function OptionCard({
  href, icon, title, tag, body, best, action,
}: {
  href: string; icon: string; title: string; tag?: string; body: string; best: string; action: string;
}) {
  return (
    <motion.div whileHover={{ y: -4 }} className={`${glass} relative flex flex-col gap-4 p-6`}>
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-linear-to-br from-blue-500/40 to-orange-500/40 text-white">
          <Icon d={icon} className="h-6 w-6" />
        </span>
        {tag && <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-xs font-medium text-emerald-200">{tag}</span>}
      </div>
      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm text-slate-200">{body}</p>
        <p className="text-sm text-slate-300">{best}</p>
      </div>
      {/* the link stretches over the whole card, so the card is one big target */}
      <Link href={href} className={`${cta} mt-auto self-start after:absolute after:inset-0 after:rounded-2xl`}>
        {action}
      </Link>
    </motion.div>
  );
}

/** The one place that answers "how do I start a resume?": upload one, or build one. */
export function StartOptions() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <OptionCard
        href="/upload"
        icon={UPLOAD}
        title="Upload your existing resume"
        tag="Fastest"
        body="We read your PDF or Word file and fill everything in for you. You check and fix it before anything is saved."
        best="Best if you already have a resume."
        action="Upload a resume"
      />
      <OptionCard
        href="/builder"
        icon={PEN}
        title="Build from scratch"
        body="Type in your roles, skills and education. We lay them out as a clean, ATS-safe PDF."
        best="Best if you are starting fresh."
        action="Start building"
      />
    </div>
  );
}

/** A secondary "next step" link row, e.g. after a resume is built. */
export function NextStep({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${btn} inline-flex items-center gap-2`}>
      {children}
      <span aria-hidden="true">→</span>
    </Link>
  );
}
