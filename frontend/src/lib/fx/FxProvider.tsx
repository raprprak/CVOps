"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** App-wide: every motion component honours the OS "reduce motion" setting. */
export function FxProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
