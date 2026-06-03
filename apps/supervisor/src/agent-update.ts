export interface AgentUpdateResponse {
  ok: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  restarting?: boolean;
  error?: string;
}

export async function pushAgentUpdate(
  hostname: string,
  port: number,
  token: string,
): Promise<AgentUpdateResponse> {
  const url = `http://${hostname}:${port}/update`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(600_000),
  });

  const body = (await res.json().catch(() => ({}))) as AgentUpdateResponse & {
    error?: string;
  };

  if (!res.ok) {
    throw new Error(body.error ?? `Agent returned ${res.status}`);
  }

  return body;
}
