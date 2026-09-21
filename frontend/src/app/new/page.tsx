"use client";

import { motion } from "motion/react";
import { ParticleMorph } from "@/lib/fx";
import { rise, stagger } from "@/lib/fx/presets";
import { PageHeader, StartOptions, Steps } from "@/lib/flow";

export default function NewResume() {
  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader
        crumbs={[{ label: "Resumes", href: "/" }, { label: "New resume" }]}
        title="Start a new resume"
        subtitle="Pick whichever is quicker. Either way, you check everything before it is saved to your career data."
        // decorative: a resume page dissolves into a globe and back; skipped on phones
        actions={<ParticleMorph loop className="pointer-events-none hidden h-44 w-72 md:block" />}
      />
      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-8">
        <motion.div variants={rise}>
          <StartOptions />
        </motion.div>
        <motion.section variants={rise} aria-labelledby="next-h" className="space-y-3">
          <h2 id="next-h" className="text-lg font-semibold text-white">What happens next</h2>
          <Steps current={1} />
        </motion.section>
      </motion.div>
    </div>
  );
}
