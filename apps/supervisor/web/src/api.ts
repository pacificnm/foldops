import {
  hasProjectDetails,
  normalizeFahProject,
} from "./fahProject";
import type {
  AlertsResponse,
  FahProjectInfo,
  MachineSummary,
  MachinesResponse,
  SnapshotsResponse,
} from "./types";

const FAH_PROJECT_API = "https://api.foldingathome.org/project";

export async function fetchAlerts(): Promise<AlertsResponse> {
  const res = await fetch("/api/alerts");
  if (!res.ok) {
    throw new Error(`Failed to load alerts (${res.status})`);
  }
  return res.json() as Promise<AlertsResponse>;
}

export async function fetchMachines(): Promise<MachinesResponse> {
  const res = await fetch("/api/machines");
  if (!res.ok) {
    throw new Error(`Failed to load machines (${res.status})`);
  }
  return res.json() as Promise<MachinesResponse>;
}

export async function fetchMachine(hostname: string): Promise<MachineSummary> {
  const res = await fetch(`/api/machines/${encodeURIComponent(hostname)}`);
  if (!res.ok) {
    throw new Error(
      res.status === 404 ? "Machine not found" : `Failed to load machine (${res.status})`,
    );
  }
  return res.json() as Promise<MachineSummary>;
}

export async function fetchSnapshots(
  hostname: string,
  limit = 500,
): Promise<SnapshotsResponse> {
  const res = await fetch(
    `/api/snapshots/${encodeURIComponent(hostname)}?limit=${limit}`,
  );
  if (!res.ok) {
    throw new Error(`Failed to load history (${res.status})`);
  }
  return res.json() as Promise<SnapshotsResponse>;
}

async function fetchFahProjectDirect(
  projectId: string,
): Promise<FahProjectInfo | null> {
  const res = await fetch(
    `${FAH_PROJECT_API}/${encodeURIComponent(projectId)}`,
  );
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) {
    throw new Error(`Folding@home API returned ${res.status}`);
  }
  const raw = (await res.json()) as Record<string, unknown>;
  const info = normalizeFahProject(raw, Number(projectId));
  return hasProjectDetails(info) ? info : null;
}

export async function fetchFahProject(
  projectId: string | number,
): Promise<FahProjectInfo | null> {
  const id = String(projectId).trim();
  if (!/^\d+$/.test(id)) {
    throw new Error(`Invalid project id: ${id}`);
  }

  const res = await fetch(`/api/projects/${encodeURIComponent(id)}`);
  const contentType = res.headers.get("content-type") ?? "";

  if (res.status === 404 && !contentType.includes("application/json")) {
    try {
      return await fetchFahProjectDirect(id);
    } catch {
      throw new Error(
        "Project API unavailable — rebuild and restart foldops-supervisor, then try again",
      );
    }
  }

  if (res.status === 404) {
    try {
      return await fetchFahProjectDirect(id);
    } catch {
      return null;
    }
  }

  if (!res.ok) {
    throw new Error(`Failed to load project (${res.status})`);
  }

  const info = (await res.json()) as FahProjectInfo;
  return hasProjectDetails(info) ? info : null;
}
