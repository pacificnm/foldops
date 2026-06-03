const FAH_PROJECT_API = "https://api.foldingathome.org/project";
const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12_000;

export interface FahProjectPublic {
  project: number;
  manager: string | null;
  cause: string | null;
  institution: string | null;
  description: string | null;
  projectRange: string | null;
  modified: string | null;
  statsUrl: string;
}

interface CacheEntry {
  data: FahProjectPublic;
  at: number;
}

const cache = new Map<number, CacheEntry>();

function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pickString(value: unknown): string | null {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return String(value);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Drop huge base64 image fields before JSON.parse. */
function slimFahProjectJson(text: string): string {
  return text
    .replace(/"mthumb"\s*:\s*"(?:\\.|[^"\\])*"/g, '"mthumb":""')
    .replace(/"thumb"\s*:\s*"(?:\\.|[^"\\])*"/g, '"thumb":""');
}

function normalizeProject(raw: Record<string, unknown>, projectId: number): FahProjectPublic {
  const descriptionHtml = pickString(raw.description) ?? pickString(raw.mdescription);
  return {
    project: projectId,
    manager: pickString(raw.manager),
    cause: pickString(raw.cause),
    institution: pickString(raw.institution),
    description: descriptionHtml ? htmlToPlain(descriptionHtml) : null,
    projectRange: pickString(raw.projects),
    modified: pickString(raw.modified),
    statsUrl: `https://stats.foldingathome.org/project/${projectId}`,
  };
}

export async function fetchFahProject(
  projectId: number,
): Promise<FahProjectPublic | null> {
  const cached = cache.get(projectId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${FAH_PROJECT_API}/${projectId}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) {
      throw new Error(`FAH API returned ${res.status}`);
    }

    const text = await res.text();
    const raw = JSON.parse(slimFahProjectJson(text)) as Record<string, unknown>;
    const data = normalizeProject(raw, projectId);
    cache.set(projectId, { data, at: Date.now() });
    return data;
  } finally {
    clearTimeout(timer);
  }
}
