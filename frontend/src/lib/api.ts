// Thin fetch wrapper over the cvops FastAPI backend (src/cvops/api/app.py).
// One developer, one machine, one backend port -- no env config to plumb through
// deploy tooling that doesn't exist. Change the port here if you ever run the
// backend elsewhere.
const API_BASE = "http://localhost:8000";

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(
      (body && typeof body === "object" && "detail" in body ? String(body.detail) : null) ??
        `${res.status} ${res.statusText}`
    );
  }
  return res.json() as Promise<T>;
}

// -- shapes -- mirror the pydantic models the API actually returns; only the fields
// the UI reads are declared. --------------------------------------------------------

export interface Link {
  label: string;
  url: string;
}

export interface Basics {
  name: string;
  email: string;
  phone: string;
  location: string | null;
  links: Link[];
}

export interface ResolvedText {
  id: string;
  text: string;
  tags: string[];
  overridden: boolean;
  metric: boolean | null;
}

export interface ResolvedSkill {
  id: string;
  name: string;
  category: string | null;
}

export interface ResolvedExperience {
  id: string;
  company: string;
  title: string;
  location: string | null;
  dates: string;
  bullets: ResolvedText[];
}

export interface ResolvedEducation {
  id: string;
  institution: string;
  degree: string;
  field: string | null;
  location: string | null;
  dates: string | null;
  details: ResolvedText[];
}

export interface ResolvedCertification {
  id: string;
  name: string;
  issuer: string | null;
  date: string | null;
  url: string | null;
}

export interface ResolvedResume {
  slug: string;
  basics: Basics;
  sections: string[];
  skills_heading: string;
  max_pages: number;
  summary: ResolvedText | null;
  skills: ResolvedSkill[];
  experience: ResolvedExperience[];
  education: ResolvedEducation[];
  certifications: ResolvedCertification[];
}

export interface BuildResult {
  slug: string;
  pdf_bytes: number;
  lint_ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface MatchLine {
  section: string;
  term: string;
  status: "missing" | "missing_from_target" | "present_as_alias" | "present";
  note: string;
}

export interface MatchResult {
  score: number;
  lines: MatchLine[];
}

export interface TailorResult {
  wrote: string;
}

// -- calls -----------------------------------------------------------------------

export const listTargets = () => request<string[]>("/targets");

export const getTarget = (slug: string) => request<ResolvedResume>(`/targets/${slug}`);

export const buildTarget = (slug: string) =>
  request<BuildResult>(`/targets/${slug}/build`, { method: "POST" });

export const pdfUrl = (slug: string) => `${API_BASE}/targets/${slug}/pdf`;

export const matchTarget = (slug: string, jdText: string) =>
  request<MatchResult>(`/targets/${slug}/match`, {
    method: "POST",
    body: JSON.stringify({ jd_text: jdText }),
  });

export const tailorTarget = (
  jdText: string,
  newSlug: string,
  maxPages: number,
  force: boolean
) =>
  request<TailorResult>("/tailor", {
    method: "POST",
    body: JSON.stringify({ jd_text: jdText, new_slug: newSlug, max_pages: maxPages, force }),
  });
