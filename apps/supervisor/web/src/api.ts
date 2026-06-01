import type { MachinesResponse } from "./types";

export async function fetchMachines(): Promise<MachinesResponse> {
  const res = await fetch("/api/machines");
  if (!res.ok) {
    throw new Error(`Failed to load machines (${res.status})`);
  }
  return res.json() as Promise<MachinesResponse>;
}
