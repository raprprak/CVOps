// Shared Glassmorphism class strings for the app workspace pages
// (design-system/*/MASTER.md: Glassmorphism, dark). Glass is for the workspace chrome only --
// the resume preview sheet must stay opaque (ATS).

export const mesh =
  "min-h-dvh bg-slate-950 bg-[image:radial-gradient(at_15%_10%,var(--color-indigo-800),transparent_50%),radial-gradient(at_85%_15%,var(--color-blue-900),transparent_50%),radial-gradient(at_50%_100%,var(--color-slate-700),transparent_55%)] px-4 py-6 text-slate-50 sm:px-6";

export const glass = "rounded-2xl border border-white/20 bg-white/10 shadow-xl backdrop-blur-md";

export const motion = "transition-all duration-200 motion-reduce:transition-none";

export const field =
  `w-full rounded-lg border border-white/40 bg-white/10 px-3 py-2 text-base text-slate-50 ${motion} ` +
  "placeholder:text-slate-300 hover:bg-white/15 focus:border-white focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/30";

export const btn =
  `cursor-pointer rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-sm font-medium text-slate-50 ${motion} ` +
  "hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

// Primary CTA: MASTER accent orange-600 with black label (5.9:1; white would be 3.6:1).
export const cta =
  `cursor-pointer rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-black ${motion} ` +
  "hover:bg-orange-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";
