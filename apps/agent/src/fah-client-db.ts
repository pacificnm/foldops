import { execFileSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import type { FahLogState } from "./fah-log.js";

export interface FahDbParseResult {
  state: FahLogState | null;
  error: string | null;
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
  if (!unit?.assignment?.project) return null;

  const wuProgress = unit.wu_progress ?? 0;
  const tpf =
    unit.eta?.trim() ||
    (unit.run_time != null && wuProgress > 0
      ? formatTpf(unit.run_time, wuProgress)
      : null);

  return {
    project: String(unit.assignment.project),
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
    if (status === "RUN") score += 1000;
    else if (ACTIVE_STATES.has(status)) score += 500;
    if (parsed.ppd != null) score += 50;

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
      units.push(JSON.parse(row.value) as FahUnitRow);
    } catch {
      // skip malformed row
    }
  }
  return units;
}

function finalizeUnits(units: FahUnitRow[]): FahDbParseResult {
  if (units.length === 0) {
    return { state: null, error: "client.db has no units rows" };
  }
  const picked = pickBestUnit(units);
  if (!picked) {
    return {
      state: null,
      error: `no active work unit in client.db (${units.length} units)`,
    };
  }
  return { state: picked, error: null };
}

async function loadUnitsViaNodeSqlite(
  dbPath: string,
): Promise<FahUnitRow[] | null> {
  try {
    const { DatabaseSync } = await import("node:sqlite");
    let db: InstanceType<typeof DatabaseSync> | undefined;
    try {
      try {
        db = new DatabaseSync(dbPath, { readOnly: true, timeout: 5000 });
      } catch {
        db = new DatabaseSync(dbPath, { timeout: 5000 });
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

function loadUnitsViaSqlite3Cli(dbPath: string): FahUnitRow[] | null {
  try {
    const stdout = execFileSync(
      "sqlite3",
      ["-json", dbPath, "SELECT value FROM units"],
      {
        encoding: "utf8",
        timeout: 10_000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    const result = JSON.parse(stdout) as { value: string }[];
    return parseUnitsJson(result);
  } catch {
    return null;
  }
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
        error: `permission denied reading ${dbPath} — run agent as root (systemctl) or: sudo apt install sqlite3 && add user to read client.db`,
      };
    }
    return {
      state: null,
      error: `${dbPath} not readable (${code ?? err})`,
    };
  }

  const nodeUnits = await loadUnitsViaNodeSqlite(dbPath);
  if (nodeUnits) {
    return finalizeUnits(nodeUnits);
  }

  const cliUnits = loadUnitsViaSqlite3Cli(dbPath);
  if (cliUnits) {
    return finalizeUnits(cliUnits);
  }

  return {
    state: null,
    error: `cannot read ${dbPath} (tried node:sqlite and sqlite3 CLI — install: sudo apt install sqlite3, run agent as root)`,
  };
}
