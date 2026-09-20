"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

// Four dots that spring into a crossing X and back. Each dot is one arm of the X: a path from a
// corner to the centre, collapsed to zero length (a round cap draws it as a dot) when closed and
// stretched to the centre when open. Same path structure in both states, so motion can spring `d`.
const CORNERS = [
  [6, 6],
  [14, 6],
  [6, 14],
  [14, 14],
] as const;

interface Props {
  open: boolean;
  onClick: () => void;
  /** Accessible name; say what the button does, e.g. "Resume actions". */
  label: string;
  /** id of the panel this button opens, for aria-controls. */
  controls?: string;
  className?: string;
  /** Visible text shown beside the dots, so the button is never an unlabelled icon. */
  children?: ReactNode;
}

export function DotsMorph({ open, onClick, label, controls, className, children }: Props) {
  const reduce = useReducedMotion();
  return (
    <button type="button" aria-label={label} aria-expanded={open} aria-controls={controls} onClick={onClick} className={className}>
      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
        {CORNERS.map(([x, y]) => (
          <motion.path
            key={`${x}-${y}`}
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            initial={false}
            animate={{ d: open ? `M${x} ${y}L10 10` : `M${x} ${y}L${x} ${y}` }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 18 }}
          />
        ))}
      </svg>
      {children}
    </button>
  );
}
