"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { ReactNode, useId, useState } from "react";
import { DotsMorph } from "@/lib/fx/DotsMorph";
import { collapse, ease, rise } from "@/lib/fx/presets";
import { btn, field, glass, motion as tx } from "@/lib/glass";

// Immutable "replace the item with this id" for editable lists.
export const patch = <T extends { id: string }>(list: T[], id: string, p: Partial<T>) =>
  list.map((x) => (x.id === id ? { ...x, ...p } : x));

export function Field({
  label, value, onChange, rows, type = "text", placeholder, autoComplete,
}: {
  label: string; value: string; onChange: (v: string) => void;
  rows?: number; type?: string; placeholder?: string; autoComplete?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-100">{label}</label>
      {rows ? (
        <textarea id={id} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={field} />
      ) : (
        <input id={id} type={type} value={value} placeholder={placeholder} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} className={field} />
      )}
    </div>
  );
}

// Preview section: plain semantic heading + content, no decoration a parser could trip on.
export function Sec({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="mt-5">
      <h3 id={id} className="border-b border-slate-900 pb-0.5 text-base font-bold">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

// Collapsible section. A real button (aria-expanded/controls) so it is keyboard-operable; the body is
// unmounted while closed, so it is out of the tab order, and animates its height open and shut.
// Rises in with its parent's stagger when there is one (variants); on its own it just shows.
export function Module({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const body = useId();
  return (
    <motion.section id={id} aria-label={title} variants={rise} className={`scroll-mt-4 ${glass}`}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={body}
          onClick={() => setOpen((o) => !o)}
          className={`flex w-full cursor-pointer items-center justify-between rounded-2xl px-4 py-3 text-left text-base font-semibold text-white ${tx} hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white`}
        >
          {title}
          <motion.svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className="h-4 w-4 shrink-0"
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.3, ease: ease.out }}
          >
            <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </motion.svg>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={body} {...collapse}>
            <div className="space-y-3 border-t border-white/20 p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

// -- ActionMenu ---------------------------------------------------------------------------
// A labelled "Manage" button (animated dots <-> X) that folds open a list of actions. Generic: an
// item is either a link or an action that may be async, may ask for confirmation first (`confirm`),
// and may return a status line to show ("Built · lint OK"). Errors thrown by an action are shown.

export interface MenuItem {
  label: string;
  hint?: string;
  href?: string; // an external link (new tab) instead of an action
  to?: string; // an in-app link
  onSelect?: () => Promise<string | void> | string | void;
  danger?: boolean;
  confirm?: string; // ask this question first, with Yes / Keep
  disabled?: boolean;
}

const itemClass =
  "flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm " +
  `${tx} hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50`;

// `leading` puts your own buttons on the same row as the trigger; the trigger then shares the row equally.
export function ActionMenu({ label = "Manage", items, leading }: { label?: string; items: MenuItem[]; leading?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<number | null>(null); // item waiting for its confirmation
  const [busy, setBusy] = useState<number | null>(null);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const panel = useId();

  async function run(i: number) {
    setAsking(null);
    setBusy(i);
    setStatus(null);
    try {
      const text = await items[i].onSelect?.();
      if (text) setStatus({ text, error: false });
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : "failed", error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <div className="flex items-center gap-2">
        {leading}
        <DotsMorph
          open={open}
          onClick={() => setOpen((o) => !o)}
          label={label}
          controls={panel}
          className={`${btn} inline-flex items-center justify-center gap-2 ${leading ? "flex-1" : ""}`}
        >
          {label}
        </DotsMorph>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={panel} {...collapse}>
            <ul className="mt-2 space-y-1">
              {items.map((it, i) => (
                <li key={it.label}>
                  {asking === i ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm">
                      <span className="text-slate-100">{it.confirm}</span>
                      <button type="button" onClick={() => run(i)} className={`${btn} border-red-300/50 text-red-200`}>
                        Yes, {it.label.toLowerCase()}
                      </button>
                      <button type="button" onClick={() => setAsking(null)} className={btn} autoFocus>
                        Keep
                      </button>
                    </div>
                  ) : it.to ? (
                    <Link href={it.to} className={itemClass}>
                      {it.label}
                      {it.hint && <span className="text-xs text-slate-300">{it.hint}</span>}
                    </Link>
                  ) : it.href ? (
                    <a href={it.href} target="_blank" rel="noopener noreferrer" className={itemClass}>
                      {it.label}
                      {it.hint && <span className="text-xs text-slate-300">{it.hint}</span>}
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled={it.disabled || busy !== null}
                      aria-busy={busy === i}
                      onClick={() => (it.confirm ? setAsking(i) : run(i))}
                      className={`${itemClass} ${it.danger ? "text-red-200" : "text-slate-50"}`}
                    >
                      {busy === i ? "Working..." : it.label}
                      {it.hint && busy !== i && <span className="text-xs text-slate-300">{it.hint}</span>}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p
              role="status"
              className={`px-3 pt-1 text-sm [overflow-wrap:anywhere] ${status?.error ? "text-red-200" : "text-emerald-200"}`}
            >
              {status?.text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
