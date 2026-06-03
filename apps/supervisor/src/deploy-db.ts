import type Database from "better-sqlite3";

export type DeployRunStatus = "running" | "completed" | "failed";

export type DeployHostStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "offline"
  | "skipped";

export interface DeployHostResult {
  hostname: string;
  status: DeployHostStatus;
  exit_code: number | null;
  message: string;
  stdout: string;
  stderr: string;
  duration_ms: number | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface DeployRunRow {
  id: string;
  created_at: string;
  status: DeployRunStatus;
  hostnames: string;
  results: string;
}

export interface DeployRun {
  id: string;
  created_at: string;
  status: DeployRunStatus;
  hostnames: string[];
  results: Record<string, DeployHostResult>;
}

export function initDeployTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deploy_runs (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      hostnames TEXT NOT NULL,
      results TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_deploy_runs_created
      ON deploy_runs(created_at DESC);
  `);
}

function parseRun(row: DeployRunRow): DeployRun {
  return {
    id: row.id,
    created_at: row.created_at,
    status: row.status as DeployRunStatus,
    hostnames: JSON.parse(row.hostnames) as string[],
    results: JSON.parse(row.results) as Record<string, DeployHostResult>,
  };
}

export function createDeployRun(
  db: Database.Database,
  id: string,
  hostnames: string[],
  results: Record<string, DeployHostResult>,
): DeployRun {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO deploy_runs (id, created_at, status, hostnames, results)
    VALUES (@id, @created_at, @status, @hostnames, @results)
  `).run({
    id,
    created_at: now,
    status: "running",
    hostnames: JSON.stringify(hostnames),
    results: JSON.stringify(results),
  });

  return {
    id,
    created_at: now,
    status: "running",
    hostnames,
    results,
  };
}

export function updateDeployRun(
  db: Database.Database,
  id: string,
  status: DeployRunStatus,
  results: Record<string, DeployHostResult>,
): void {
  db.prepare(`
    UPDATE deploy_runs SET status = @status, results = @results WHERE id = @id
  `).run({
    id,
    status,
    results: JSON.stringify(results),
  });
}

export function getDeployRun(
  db: Database.Database,
  id: string,
): DeployRun | null {
  const row = db
    .prepare("SELECT * FROM deploy_runs WHERE id = ?")
    .get(id) as DeployRunRow | undefined;
  return row ? parseRun(row) : null;
}

export function listDeployRuns(
  db: Database.Database,
  limit = 20,
): DeployRun[] {
  const rows = db
    .prepare(
      "SELECT * FROM deploy_runs ORDER BY created_at DESC LIMIT ?",
    )
    .all(limit) as DeployRunRow[];
  return rows.map(parseRun);
}
