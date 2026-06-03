import type {
  FahProjectInfo,
  MachineSummary,
  MachinesResponse,
  SnapshotsResponse,
} from "./types";

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

export async function fetchFahProject(
  projectId: string | number,
): Promise<FahProjectInfo | null> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(String(projectId))}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to load project (${res.status})`);
  }
  return res.json() as Promise<FahProjectInfo>;
}
