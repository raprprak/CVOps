// Thin fetch wrapper over the cvops FastAPI backend (src/cvops/api/app.py).
// One developer, one machine, one backend port -- no env config to plumb through
// deploy tooling that doesn't exist. Change the port here if you ever run the
// backend elsewhere.
const API_BASE = "http://localhost:8000";

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // A FormData body needs the browser to set its own multipart Content-Type (with boundary).
  const isForm = init?.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: isForm ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
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

export interface MasterStats {
  name: string;
  roles: number;
  projects: number;
  bullets: number;
  skills: number;
  education: number;
  certifications: number;
}

export interface TargetInfo {
  slug: string;
  valid: boolean;
  problem: string | null;
  max_pages: number;
  bullets: number;
  skills: number;
  version: string | null;
  updated: string | null;
  built_at: string | null;
  pdf_bytes: number | null;
}

export interface Overview {
  master: MasterStats;
  targets: TargetInfo[];
}

export interface ImportSummary {
  id: string;
  filename: string;
  imported_at: string;
  applied_at: string | null;
  name: string;
  roles: number;
  bullets: number;
  skills: number;
  projects: number;
  education: number;
  certifications: number;
  warnings: string[];
  problems: string[];
}

// A parsed draft in Master's shape, but lax: required fields may be empty until fixed.
export interface DraftText {
  id: string;
  text: string;
  tags: string[];
}

export interface DraftMaster {
  basics: { name: string; email: string; phone: string; location: string | null; links: Link[] };
  summaries: DraftText[];
  skills: { id: string; name: string; category: string | null; tags: string[]; aliases: string[] }[];
  experience: {
    id: string; company: string; title: string; location: string | null;
    start: string; end: string | null; bullets: DraftText[];
  }[];
  projects: {
    id: string; name: string; url: string | null;
    start: string | null; end: string | null; bullets: DraftText[];
  }[];
  education: {
    id: string; institution: string; degree: string; field: string | null; location: string | null;
    start: string | null; end: string | null; details: DraftText[];
  }[];
  certifications: {
    id: string; name: string; issuer: string | null; date: string | null; url: string | null;
  }[];
}

export interface ImportDraft {
  id: string;
  filename: string;
  imported_at: string;
  applied_at: string | null;
  warnings: string[];
  problems: string[];
  master: DraftMaster;
}

export interface ApplyResult {
  slug: string;
  added: Record<string, number>;
  already_present: Record<string, number>;
}

// -- calls -----------------------------------------------------------------------

export const getOverview = () => request<Overview>("/overview");

export const getImport = (id: string) => request<ImportDraft>(`/imports/${id}`);

export const saveImport = (id: string, master: DraftMaster) =>
  request<ImportDraft>(`/imports/${id}`, { method: "PUT", body: JSON.stringify({ master }) });

export const getMaster = () => request<{ basics: Basics }>("/master");

// A draft made in the builder (no uploaded file); apply it like any import.
export const createDraft = (master: DraftMaster, name: string) =>
  request<ImportDraft>("/imports/draft", { method: "POST", body: JSON.stringify({ master, name }) });

export const applyImport = (id: string, slug: string, maxPages: number) =>
  request<ApplyResult>(`/imports/${id}/apply`, {
    method: "POST",
    body: JSON.stringify({ slug, max_pages: maxPages }),
  });

export const deleteImport = (id: string) =>
  request<{ moved: string[] }>(`/imports/${id}`, { method: "DELETE" });

export const listImports = () => request<ImportSummary[]>("/imports");

export const uploadResume = (file: File) => {
  const body = new FormData();
  body.append("file", file);
  return request<ImportSummary>("/imports", { method: "POST", body });
};

export const listTargets = () => request<string[]>("/targets");

export const getTarget = (slug: string) => request<ResolvedResume>(`/targets/${slug}`);

export const buildTarget = (slug: string) =>
  request<BuildResult>(`/targets/${slug}/build`, { method: "POST" });

export const deleteTarget = (slug: string) =>
  request<{ moved: string[]; overview: Overview }>(`/targets/${slug}`, { method: "DELETE" });

export const pdfUrl =(slug: string) => `${API_BASE}/targets/${slug}/pdf`;

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
