import type { FahLogState } from "./fah-log.js";

const WS_PATH = "/api/websocket";
const DEFAULT_TIMEOUT_MS = 5000;

interface WsUnit {
  ppd?: number;
  state?: {
    state?: string;
    ppd?: number;
    eta?: string;
    wu_progress?: number;
    progress?: number;
    assignment?: { project?: number };
    wu?: { run?: number; clone?: number; gen?: number };
  };
}

function progressPercent(unit: NonNullable<WsUnit["state"]>): number | null {
  if (unit.wu_progress != null && unit.wu_progress > 0) {
    const p = unit.wu_progress <= 1 ? unit.wu_progress * 100 : unit.wu_progress;
    return Math.round(p * 1000) / 1000;
  }
  if (unit.progress != null && unit.progress > 0) {
    const p = unit.progress <= 1 ? unit.progress * 100 : unit.progress;
    return Math.round(p * 1000) / 1000;
  }
  return null;
}

function unitToState(raw: WsUnit): FahLogState | null {
  const inner = raw.state;
  if (!inner) return null;

  const project = inner.assignment?.project;
  const ppd = (raw.ppd ?? inner.ppd) != null && (raw.ppd ?? inner.ppd)! > 0
    ? (raw.ppd ?? inner.ppd)!
    : null;
  const progress = progressPercent(inner);

  if (project == null && ppd == null && progress == null && !inner.eta?.trim()) {
    return null;
  }

  return {
    project: project != null ? String(project) : null,
    run: inner.wu?.run ?? null,
    clone: inner.wu?.clone ?? null,
    gen: inner.wu?.gen ?? null,
    progress,
    ppd,
    tpf: inner.eta?.trim() || null,
    recentErrors: [],
  };
}

function pickBestUnit(units: WsUnit[]): FahLogState | null {
  let best: { state: FahLogState; score: number } | null = null;

  for (const raw of units) {
    const parsed = unitToState(raw);
    if (!parsed) continue;
    const status = raw.state?.state ?? "";
    let score = parsed.progress ?? 0;
    if (parsed.ppd != null) score += 200;
    if (status === "RUN") score += 1000;
    else if (status === "CORE") score += 300;

    if (!best || score > best.score) {
      best = { state: parsed, score };
    }
  }

  return best?.state ?? null;
}

function stateFromWsPayload(data: Record<string, unknown>): FahLogState | null {
  const units = data.units;
  if (!Array.isArray(units) || units.length === 0) return null;
  return pickBestUnit(units as WsUnit[]);
}

/**
 * Read live PPD/TPF from the FAH v8 local WebSocket (port 7396).
 * Fills gaps while client.db is still CORE.
 */
export async function parseFahWebSocket(
  host = process.env.FAH_WS_HOST ?? "127.0.0.1",
  port = Number(process.env.FAH_WS_PORT ?? "7396"),
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<FahLogState | null> {
  const url = `ws://${host}:${port}${WS_PATH}`;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: FahLogState | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      finish(null);
      return;
    }

    ws.addEventListener("message", (ev) => {
      const text = String(ev.data);
      if (text === "ping") return;
      try {
        const parsed = JSON.parse(text) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const state = stateFromWsPayload(parsed as Record<string, unknown>);
          if (state) finish(state);
        }
      } catch {
        // ignore malformed frame
      }
    });

    ws.addEventListener("error", () => finish(null));
    ws.addEventListener("close", () => finish(null));
  });
}
