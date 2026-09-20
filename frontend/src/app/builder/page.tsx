"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { btn, glass, mesh } from "@/lib/glass";
import { collapse, ease, rise, stagger } from "@/lib/fx/presets";
import { Field, Module, Sec, patch } from "@/lib/ui";

// Prototype: state lives in the browser only. Nothing here is saved or sent to the API.

type Job = { id: string; title: string; company: string; dates: string; bullets: string };
type Edu = { id: string; school: string; degree: string; dates: string };

const SECTIONS = ["basics", "summary", "skills", "experience", "education"] as const;

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const isHttp = (s: string) => /^https?:\/\//i.test(s);

export default function Builder() {
  const [b, setB] = useState({
    name: "Jane Doe",
    email: "jane.doe@example.com",
    phone: "+1 555 010 0199",
    location: "Austin, TX",
    url: "https://example.com/in/jane-doe",
  });
  const [summary, setSummary] = useState("Backend engineer with 6 years building and operating Python services on AWS.");
  const [skills, setSkills] = useState("Python, FastAPI, PostgreSQL, Docker, Kubernetes, Terraform");
  const [jobs, setJobs] = useState<Job[]>([
    {
      id: "job-1", title: "Senior Software Engineer", company: "Acme Corp", dates: "2021-03 - Present",
      bullets: "Cut API p95 latency from 800 ms to 220 ms by moving hot paths to async FastAPI handlers.\nLed migration of 14 services to Kubernetes, reducing deploy time by 60%.",
    },
  ]);
  const [edus, setEdus] = useState<Edu[]>([
    { id: "edu-1", school: "State University", degree: "B.S. Computer Science", dates: "2014 - 2018" },
  ]);

  const set = (k: keyof typeof b) => (v: string) => setB({ ...b, [k]: v });
  const skillList = skills.split(",").map((s) => s.trim()).filter(Boolean);
  const shownJobs = jobs.filter((j) => j.title || j.company);
  const shownEdus = edus.filter((e) => e.school || e.degree);

  return (
    <div className={mesh}>
      <motion.div variants={rise} initial="hidden" animate="show" className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">ATS Resume Builder</h1>
        <Link href="/" className={btn}>Dashboard</Link>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* LEFT: glass controls */}
        <motion.div variants={stagger} initial="hidden" animate="show" className="min-w-0 space-y-4">
          <motion.nav variants={rise} aria-label="Form sections" className={`${glass} flex flex-wrap gap-2 p-3`}>
            {SECTIONS.map((s) => (
              <a key={s} href={`#${s}`} className={`${btn} capitalize`}>{s}</a>
            ))}
          </motion.nav>

          <Module id="basics" title="Basics">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name" value={b.name} onChange={set("name")} autoComplete="name" />
              <Field label="Email" type="email" value={b.email} onChange={set("email")} autoComplete="email" />
              <Field label="Phone" type="tel" value={b.phone} onChange={set("phone")} autoComplete="tel" />
              <Field label="Location" value={b.location} onChange={set("location")} />
              <div className="sm:col-span-2">
                <Field label="Website" type="url" value={b.url} onChange={set("url")} placeholder="https://" />
              </div>
            </div>
          </Module>

          <Module id="summary" title="Summary">
            <Field label="Professional summary" rows={4} value={summary} onChange={setSummary} />
          </Module>

          <Module id="skills" title="Skills">
            <Field label="Skills (comma-separated)" rows={3} value={skills} onChange={setSkills} placeholder="Python, FastAPI, PostgreSQL" />
          </Module>

          <Module id="experience" title="Experience">
            <AnimatePresence initial={false}>
            {jobs.map((j, i) => (
              <motion.fieldset key={j.id} {...collapse} className="space-y-3 rounded-xl border border-white/20 p-3">
                <legend className="px-1 text-sm font-medium text-slate-100">Role {i + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Job title" value={j.title} onChange={(v) => setJobs(patch(jobs, j.id, { title: v }))} />
                  <Field label="Company" value={j.company} onChange={(v) => setJobs(patch(jobs, j.id, { company: v }))} />
                </div>
                <Field label="Dates" value={j.dates} onChange={(v) => setJobs(patch(jobs, j.id, { dates: v }))} placeholder="2021-03 - Present" />
                <Field label="Bullets (one per line)" rows={5} value={j.bullets} onChange={(v) => setJobs(patch(jobs, j.id, { bullets: v }))} />
                <button type="button" className={btn} onClick={() => setJobs(jobs.filter((x) => x.id !== j.id))}>
                  Remove role {i + 1}
                </button>
              </motion.fieldset>
            ))}
            </AnimatePresence>
            <button
              type="button"
              className={btn}
              onClick={() => setJobs([...jobs, { id: crypto.randomUUID(), title: "", company: "", dates: "", bullets: "" }])}
            >
              Add role
            </button>
          </Module>

          <Module id="education" title="Education">
            <AnimatePresence initial={false}>
            {edus.map((e, i) => (
              <motion.fieldset key={e.id} {...collapse} className="space-y-3 rounded-xl border border-white/20 p-3">
                <legend className="px-1 text-sm font-medium text-slate-100">Education {i + 1}</legend>
                <Field label="School" value={e.school} onChange={(v) => setEdus(patch(edus, e.id, { school: v }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Degree" value={e.degree} onChange={(v) => setEdus(patch(edus, e.id, { degree: v }))} />
                  <Field label="Dates" value={e.dates} onChange={(v) => setEdus(patch(edus, e.id, { dates: v }))} />
                </div>
                <button type="button" className={btn} onClick={() => setEdus(edus.filter((x) => x.id !== e.id))}>
                  Remove education {i + 1}
                </button>
              </motion.fieldset>
            ))}
            </AnimatePresence>
            <button
              type="button"
              className={btn}
              onClick={() => setEdus([...edus, { id: crypto.randomUUID(), school: "", degree: "", dates: "" }])}
            >
              Add education
            </button>
          </Module>
        </motion.div>

        {/* RIGHT: ATS layer -- solid white, single column, no glass/transparency/charts.
            min-w-0 + overflow-wrap:anywhere = "Long Token Wrapping"; no overflow-hidden anywhere. */}
        <motion.section
          aria-label="Live preview"
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, ease: ease.out, delay: 0.15 }}
          className="min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto"
        >
          <article className="min-w-0 rounded-sm bg-white p-5 text-slate-900 shadow-xl [overflow-wrap:anywhere] sm:p-8">
            <header>
              <h2 className="text-2xl font-bold">{b.name}</h2>
              <address className="mt-1 space-y-0.5 text-sm not-italic">
                {b.email && (
                  <p>Email: <a href={`mailto:${b.email}`} className="underline">{b.email}</a></p>
                )}
                {b.phone && <p>Phone: {b.phone}</p>}
                {b.location && <p>Location: {b.location}</p>}
                {b.url && (
                  <p>
                    Website:{" "}
                    {isHttp(b.url) ? <a href={b.url} className="underline">{b.url}</a> : b.url}
                  </p>
                )}
              </address>
            </header>

            {summary.trim() && (
              <Sec title="Summary"><p className="text-sm">{summary}</p></Sec>
            )}

            {skillList.length > 0 && (
              <Sec title="Skills"><p className="text-sm">{skillList.join(", ")}</p></Sec>
            )}

            {shownJobs.length > 0 && (
              <Sec title="Experience">
                {shownJobs.map((j) => (
                  <div key={j.id} className="mt-3 first:mt-0">
                    <h4 className="font-semibold">{[j.title, j.company].filter(Boolean).join(", ")}</h4>
                    {j.dates && <p className="text-sm">{j.dates}</p>}
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                      {lines(j.bullets).map((l, k) => <li key={k}>{l}</li>)}
                    </ul>
                  </div>
                ))}
              </Sec>
            )}

            {shownEdus.length > 0 && (
              <Sec title="Education">
                {shownEdus.map((e) => (
                  <div key={e.id} className="mt-3 first:mt-0">
                    <h4 className="font-semibold">{[e.degree, e.school].filter(Boolean).join(", ")}</h4>
                    {e.dates && <p className="text-sm">{e.dates}</p>}
                  </div>
                ))}
              </Sec>
            )}
          </article>
        </motion.section>
      </div>
    </div>
  );
}
