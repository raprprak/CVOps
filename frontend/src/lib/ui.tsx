"use client";

import { ReactNode, useId } from "react";
import { field, glass, motion } from "@/lib/glass";

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

// Native <details>: keyboard-operable and collapsible with no JS state.
export function Module({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <details id={id} open className={`group scroll-mt-4 ${glass}`}>
      <summary
        className={`flex cursor-pointer list-none items-center justify-between rounded-2xl px-4 py-3 text-base font-semibold text-white ${motion} hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white [&::-webkit-details-marker]:hidden`}
      >
        {title}
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={`h-4 w-4 shrink-0 group-open:rotate-180 ${motion}`}>
          <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="space-y-3 border-t border-white/20 p-4">{children}</div>
    </details>
  );
}
