import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { promisify } from "node:util";
import type { FahLogState } from "./fah-log.js";

const execFileAsync = promisify(execFile);

export interface FahDbParseResult {
  state: FahLogState | null;
  error: string | null;
  source: "sqlite3-cli" | "node-sqlite" | null;
}

interface FahUnitState {
  state?: string;
  progress?: number;
  wu_progress?: number;
  ppd?: number;
  eta?: string;
  run_time?: number;
  assignment?: { project?: number };
  wu?: { run?: number; clone?: number; gen?: number };
}

interface FahUnitRow {
  state?: FahUnitState;
}

const ACTIVE_STATES = new Set(["RUN", "DOWNLOAD", "UPLOAD", "READY"]);

/** FAH stores either `{ state: { ...metrics } }` or the slot object at the root. */
function normalizeUnitRow(raw: unknown): FahUnitRow | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const inner = obj.state;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return { state: inner as FahUnitState };
  }
  if (
    typeof inner === "string" ||
    "wu_progress" in obj ||
    "ppd" in obj ||
    "assignment" in obj
  ) {
    return { state: obj as FahUnitState };
  }
  return null;
}

function extractProject(unit: FahUnitState): string | null {
  const nested = unit as {
    assignment?: { project?: number; data?: { project?: number } };
    data?: { assignment?: { data?: { project?: number } } };
    project?: number;
  };
  const candidates = [
    nested.assignment?.project,
    nested.assignment?.data?.project,
    nested.data?.assignment?.data?.project,
    nested.project,
  ];
  for (const p of candidates) {
    if (p != null) return String(p);
  }
  return null;
}

function unitHasMetrics(unit: FahUnitState): boolean {
  return (
    (unit.ppd != null && unit.ppd > 0) ||
    Boolean(unit.eta?.trim()) ||
    unit.wu_progress != null ||
    progressPercent(unit) != null
  );
}

function formatTpf(runTimeSec: number, wuProgress: number): string | null {
  if (wuProgress <= 0 || runTimeSec <= 0) return null;
  const totalSec = runTimeSec / wuProgress;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function progressPercent(unit: FahUnitState): number | null {
  if (unit.wu_progress != null && unit.wu_progress >= 0) {
    const p = unit.wu_progress <= 1 ? unit.wu_progress * 100 : unit.wu_progress;
    return Math.round(p * 1000) / 1000;
  }
  if (unit.progress != null && unit.progress > 0) {
    const p = unit.progress <= 1 ? unit.progress * 100 : unit.progress;
    return Math.round(p * 1000) / 1000;
  }
  return null;
}

function unitToState(row: FahUnitRow): FahLogState | null {
  const unit = row.state;
  if (!unit) return null;

  const project = extractProject(unit);
  if (project == null && !unitHasMetrics(unit)) return null;

  const wuProgress = unit.wu_progress ?? 0;
  const tpf =
    unit.eta?.trim() ||
    (unit.run_time != null && wuProgress > 0
      ? formatTpf(unit.run_time, wuProgress)
      : null);

  return {
    project,
    run: unit.wu?.run ?? null,
    clone: unit.wu?.clone ?? null,
    gen: unit.wu?.gen ?? null,
    progress: progressPercent(unit),
    ppd: unit.ppd != null && unit.ppd > 0 ? unit.ppd : null,
    tpf,
    recentErrors: [],
  };
}

function pickBestUnit(rows: FahUnitRow[]): FahLogState | null {
  let best: { state: FahLogState; score: number } | null = null;

  for (const row of rows) {
    const unit = row.state;
    if (!unit) continue;
    const parsed = unitToState(row);
    if (!parsed) continue;

    const status = unit.state ?? "";
    let score = progressPercent(unit) ?? 0;
    if (parsed.ppd != null) score += 200;
    if (status === "RUN") score += 1000;
    else if (ACTIVE_STATES.has(status)) score += 500;

    if (!best || score > best.score) {
      best = { state: parsed, score };
    }
  }

  return best?.state ?? null;
}

/** Use any slot that has PPD/progress even when not RUN (paused, finishing, etc.) */
function pickBestUnitRelaxed(rows: FahUnitRow[]): FahLogState | null {
  let best: { state: FahLogState; score: number } | null = null;

  for (const row of rows) {
    const unit = row.state;
    if (!unit) continue;
    const parsed = unitToState(row);
    if (!parsed) continue;
    const score =
      (parsed.ppd ?? 0) + (progressPercent(unit) ?? 0) * 10;
    if (!best || score > best.score) {
      best = { state: parsed, score };
    }
  }

  return best?.state ?? null;
}

function parseUnitsJson(rows: { value: string }[]): FahUnitRow[] {
  const units: FahUnitRow[] = [];
  for (const row of rows) {
    try {
      const normalized = normalizeUnitRow(JSON.parse(row.value));
      if (normalized) units.push(normalized);
    } catch {
      // skip malformed row
    }
  }
  return units;
}

function finalizeUnits(
  units: FahUnitRow[],
  source: FahDbParseResult["source"],
): FahDbParseResult {
  if (units.length === 0) {
    return { state: null, error: "client.db has no units rows", source: null };
  }
  let picked = pickBestUnit(units);
  if (!picked) {
    picked = pickBestUnitRelaxed(units);
  }
  if (!picked) {
    const hint = units
      .map((u) => u.state?.state ?? "unknown")
      .join(", ");
    return {
      state: null,
      error: `no readable work unit in client.db (${units.length} units, states: ${hint}) — is fah-client folding?`,
      source: null,
    };
  }
  return { state: picked, error: null, source };
}

async function loadUnitsViaSqlite3Cli(
  dbPath: string,
): Promise<FahUnitRow[] | null> {
  try {
    const { stdout } = await execFileAsync(
      "sqlite3",
      ["-json", dbPath, "SELECT value FROM units"],
      {
        encoding: "utf8",
        timeout: 8000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    const result = JSON.parse(stdout) as { value: string }[];
    return parseUnitsJson(result);
  } catch {
    return null;
  }
}

async function loadUnitsViaNodeSqlite(
  dbPath: string,
): Promise<FahUnitRow[] | null> {
  try {
    const { DatabaseSync } = await import("node:sqlite");
    let db: InstanceType<typeof DatabaseSync> | undefined;
    try {
      try {
        db = new DatabaseSync(dbPath, { readOnly: true, timeout: 3000 });
      } catch {
        db = new DatabaseSync(dbPath, { timeout: 3000 });
        db.exec("PRAGMA query_only = ON");
      }
      const rows = db
        .prepare("SELECT value FROM units")
        .all() as { value: string }[];
      return parseUnitsJson(rows);
    } finally {
      try {
        db?.close();
      } catch {
        // ignore
      }
    }
  } catch {
    return null;
  }
}

const DB_READ_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

export async function parseFahClientDb(
  dbPath: string,
): Promise<FahDbParseResult> {
  try {
    accessSync(dbPath, constants.R_OK);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") {
      return {
        state: null,
        source: null,
        error: `permission denied reading ${dbPath} — run: sudo systemctl restart foldops-agent`,
      };
    }
    return {
      state: null,
      source: null,
      error: `${dbPath} not readable (${code ?? err})`,
    };
  }

  try {
    return await withTimeout(readClientDb(dbPath), DB_READ_TIMEOUT_MS);
  } catch {
    return {
      state: null,
      source: null,
      error: `timed out reading ${dbPath} after ${DB_READ_TIMEOUT_MS}ms`,
    };
  }
}

async function readClientDb(dbPath: string): Promise<FahDbParseResult> {
  // Prefer sqlite3 CLI on production Debian (node:sqlite is experimental)
  const cliUnits = await loadUnitsViaSqlite3Cli(dbPath);
  if (cliUnits) {
    return finalizeUnits(cliUnits, "sqlite3-cli");
  }

  const nodeUnits = await loadUnitsViaNodeSqlite(dbPath);
  if (nodeUnits) {
    return finalizeUnits(nodeUnits, "node-sqlite");
  }

  return {
    state: null,
    source: null,
    error: `cannot read ${dbPath} — run: sudo apt install sqlite3 && sudo systemctl restart foldops-agent`,
  };
}
