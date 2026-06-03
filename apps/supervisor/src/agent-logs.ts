export type LogSource = "fah" | "work";

export interface AgentLogResponse {
  source: LogSource;
  path: string;
  lines: string[];
}

export async function fetchLiveAgentLogs(
  hostname: string,
  port: number,
  token: string,
  source: LogSource,
  lines: number,
): Promise<AgentLogResponse> {
  const url = `http://${hostname}:${port}/logs/${source}?lines=${lines}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8_000),
  });

  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    path?: string;
    lines?: string[];
  };

  if (!res.ok) {
    throw new Error(body.error ?? `Agent returned ${res.status}`);
  }

  return {
    source,
    path: body.path ?? "",
    lines: Array.isArray(body.lines) ? body.lines : [],
  };
}
