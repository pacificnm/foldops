import { accessSync, constants } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { FahLogState } from "./fah-log.js";

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
    (unit.run_time != null ? formatTpf(unit.run_time, wuProgress) : null);

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

    if (!best || score > best.score) {
      best = { state: parsed, score };
    }
  }

  return best?.state ?? null;
}

export function parseFahClientDb(dbPath: string): FahLogState | null {
  try {
    accessSync(dbPath, constants.R_OK);
  } catch {
    return null;
  }

  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(dbPath, { open: true, readOnly: true });
    const rows = db
      .prepare("SELECT value FROM units")
      .all() as { value: string }[];

    const units: FahUnitRow[] = [];
    for (const row of rows) {
      try {
        units.push(JSON.parse(row.value) as FahUnitRow);
      } catch {
        // skip malformed row
      }
    }

    return pickBestUnit(units);
  } catch {
    return null;
  } finally {
    db?.close();
  }
}
