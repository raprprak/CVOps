"use client";

import dynamic from "next/dynamic";

// three.js is loaded only when a ParticleMorph actually mounts, and never during SSR.
export const ParticleMorph = dynamic(() => import("./ParticleMorph"), { ssr: false });

export { FxProvider } from "./FxProvider";
export * from "./presets";
export * from "./shapes";
