export interface AgentControlResult {
  ok: boolean;
  action: string;
  message: string;
  stdout: string;
  stderr: string;
}

export interface AgentControlStatus {
  foldops_agent: string;
  fah_client: string;
}

export async function fetchAgentControlStatus(
  hostname: string,
  port: number,
  token: string,
): Promise<AgentControlStatus> {
  const url = `http://${hostname}:${port}/control/status`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8_000),
  });

  const body = (await res.json().catch(() => ({}))) as AgentControlStatus & {
    error?: string;
  };

  if (!res.ok) {
    throw new Error(body.error ?? `Agent returned ${res.status}`);
  }

  return body;
}

export async function pushAgentControl(
  hostname: string,
  port: number,
  token: string,
  action: string,
): Promise<AgentControlResult> {
  const url = `http://${hostname}:${port}/control`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action }),
    signal: AbortSignal.timeout(120_000),
  });

  const body = (await res.json().catch(() => ({}))) as AgentControlResult & {
    error?: string;
  };

  if (!res.ok) {
    throw new Error(body.error ?? `Agent returned ${res.status}`);
  }

  return body;
}
