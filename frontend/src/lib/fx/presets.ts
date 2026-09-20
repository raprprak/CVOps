// Shared motion tokens: one place for durations, easing and the entrance/exit recipes, so every
// page moves the same way. Entrances decelerate (ease out); exits are quicker and accelerate.

import type { TargetAndTransition, Transition, Variants } from "motion/react";

type Bezier = [number, number, number, number];
export const ease: { out: Bezier; in: Bezier } = { out: [0.16, 1, 0.3, 1], in: [0.4, 0, 1, 1] };

export const spring: Transition = { type: "spring", stiffness: 300, damping: 34 };

/** Parent: reveals its motion children one after another. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

/** Child: rises into place. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: ease.out } },
};

/** Child: fades up from slightly smaller (stat tiles). */
export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: ease.out } },
};

/** A list row that grows in and folds away (add/remove in editors). Spread onto a motion element
 *  inside <AnimatePresence initial={false}>. Overflow is only clipped while the height moves. */
export const collapse: { initial: TargetAndTransition; animate: TargetAndTransition; exit: TargetAndTransition } = {
  initial: { opacity: 0, height: 0, overflow: "hidden" },
  animate: {
    opacity: 1,
    height: "auto",
    transitionEnd: { overflow: "visible" },
    transition: { duration: 0.3, ease: ease.out },
  },
  exit: { opacity: 0, height: 0, overflow: "hidden", transition: { duration: 0.2, ease: ease.in } },
};
