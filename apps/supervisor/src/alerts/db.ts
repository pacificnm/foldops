import type Database from "better-sqlite3";
import type { AlertKind, AlertSeverity } from "./types.js";

export interface AlertRow {
  id: string;
  hostname: string;
  kind: AlertKind;
  severity: AlertSeverity;
  message: string;
  details: string | null;
  active: number;
  fired_at: string;
  resolved_at: string | null;
  last_notified_at: string | null;
}

export function initAlertTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      hostname TEXT NOT NULL,
      kind TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      fired_at TEXT NOT NULL,
      resolved_at TEXT,
      last_notified_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(active, fired_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_fired ON alerts(fired_at DESC);
  `);
}

export type AlertHistoryFilter = "all" | "active" | "resolved";

export interface ListAlertHistoryOpts {
  limit: number;
  status?: AlertHistoryFilter;
  hostname?: string;
}

export function listAlertHistory(
  db: Database.Database,
  opts: ListAlertHistoryOpts,
): AlertRow[] {
  const limit = Math.min(Math.max(opts.limit, 1), 500);
  const conditions: string[] = [];
  const params: Record<string, string | number> = { limit };

  if (opts.status === "active") {
    conditions.push("active = 1");
  } else if (opts.status === "resolved") {
    conditions.push("active = 0");
  }

  if (opts.hostname) {
    conditions.push("hostname = @hostname");
    params.hostname = opts.hostname;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return db
    .prepare(
      `SELECT * FROM alerts ${where} ORDER BY fired_at DESC LIMIT @limit`,
    )
    .all(params) as AlertRow[];
}

export function countAlertsByStatus(db: Database.Database): {
  active: number;
  resolved: number;
  total: number;
} {
  const rows = db
    .prepare(
      `SELECT active, COUNT(*) as n FROM alerts GROUP BY active`,
    )
    .all() as { active: number; n: number }[];

  let active = 0;
  let resolved = 0;
  for (const row of rows) {
    if (row.active === 1) active = row.n;
    else resolved = row.n;
  }
  return { active, resolved, total: active + resolved };
}

export function listActiveAlerts(db: Database.Database): AlertRow[] {
  return db
    .prepare(
      "SELECT * FROM alerts WHERE active = 1 ORDER BY severity DESC, fired_at DESC",
    )
    .all() as AlertRow[];
}

export function getAlert(
  db: Database.Database,
  id: string,
): AlertRow | undefined {
  return db.prepare("SELECT * FROM alerts WHERE id = ?").get(id) as
    | AlertRow
    | undefined;
}

export function upsertActiveAlert(
  db: Database.Database,
  row: {
    id: string;
    hostname: string;
    kind: AlertKind;
    severity: AlertSeverity;
    message: string;
    details: string | null;
    notifiedAt: string;
  },
): void {
  const now = new Date().toISOString();
  const existing = getAlert(db, row.id);
  const firedAt =
    existing?.active === 1 ? existing.fired_at : now;

  db.prepare(`
    INSERT INTO alerts (
      id, hostname, kind, severity, message, details, active,
      fired_at, resolved_at, last_notified_at
    ) VALUES (
      @id, @hostname, @kind, @severity, @message, @details, 1,
      @fired_at, NULL, @last_notified_at
    )
    ON CONFLICT(id) DO UPDATE SET
      severity = @severity,
      message = @message,
      details = @details,
      active = 1,
      fired_at = @fired_at,
      resolved_at = NULL,
      last_notified_at = @last_notified_at
  `).run({
    id: row.id,
    hostname: row.hostname,
    kind: row.kind,
    severity: row.severity,
    message: row.message,
    details: row.details,
    fired_at: firedAt,
    last_notified_at: row.notifiedAt,
  });
}

export function resolveAlert(
  db: Database.Database,
  id: string,
  notifiedAt: string,
): void {
  db.prepare(`
    UPDATE alerts SET
      active = 0,
      resolved_at = @resolved_at,
      last_notified_at = @last_notified_at
    WHERE id = @id
  `).run({
    id,
    resolved_at: new Date().toISOString(),
    last_notified_at: notifiedAt,
  });
}
