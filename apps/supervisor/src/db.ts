import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { IngestPayload } from "@foldops/shared";

export interface SnapshotRow {
  id: number;
  hostname: string;
  created_at: string;
  payload: string;
  fah_status: string;
  project: string | null;
  run: number | null;
  clone: number | null;
  gen: number | null;
  progress: number | null;
  ppd: number | null;
  cpu_usage: number | null;
  memory_percent: number | null;
  disk_percent: number | null;
  apt_updates: number;
  reboot_required: number;
}

export interface MachineRow {
  hostname: string;
  first_seen: string;
  last_seen: string;
}

export function initDb(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS machines (
      hostname TEXT PRIMARY KEY,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hostname TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      fah_status TEXT NOT NULL,
      project TEXT,
      run INTEGER,
      clone INTEGER,
      gen INTEGER,
      progress REAL,
      ppd REAL,
      cpu_usage REAL,
      memory_percent REAL,
      disk_percent REAL,
      apt_updates INTEGER NOT NULL DEFAULT 0,
      reboot_required INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (hostname) REFERENCES machines(hostname)
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_hostname_created
      ON snapshots(hostname, created_at DESC);
  `);

  return db;
}

export function ingestSnapshot(
  db: Database.Database,
  payload: IngestPayload,
): void {
  const now = payload.timestamp;
  const upsertMachine = db.prepare(`
    INSERT INTO machines (hostname, first_seen, last_seen)
    VALUES (@hostname, @now, @now)
    ON CONFLICT(hostname) DO UPDATE SET last_seen = @now
  `);

  const insertSnapshot = db.prepare(`
    INSERT INTO snapshots (
      hostname, created_at, payload, fah_status, project, run, clone, gen,
      progress, ppd, cpu_usage, memory_percent, disk_percent, apt_updates, reboot_required
    ) VALUES (
      @hostname, @created_at, @payload, @fah_status, @project, @run, @clone, @gen,
      @progress, @ppd, @cpu_usage, @memory_percent, @disk_percent, @apt_updates, @reboot_required
    )
  `);

  const tx = db.transaction(() => {
    upsertMachine.run({ hostname: payload.hostname, now });
    insertSnapshot.run({
      hostname: payload.hostname,
      created_at: now,
      payload: JSON.stringify(payload),
      fah_status: payload.fah.systemdStatus,
      project: payload.fah.project,
      run: payload.fah.run,
      clone: payload.fah.clone,
      gen: payload.fah.gen,
      progress: payload.fah.progress,
      ppd: payload.fah.ppd,
      cpu_usage: payload.system.cpuUsage,
      memory_percent: payload.system.memory.percent,
      disk_percent: payload.system.disk.percent,
      apt_updates: payload.maintenance.aptUpdatesAvailable,
      reboot_required: payload.maintenance.rebootRequired ? 1 : 0,
    });
  });

  tx();
}

export function listMachines(db: Database.Database): MachineRow[] {
  return db
    .prepare("SELECT hostname, first_seen, last_seen FROM machines ORDER BY hostname")
    .all() as MachineRow[];
}

export function getMachine(
  db: Database.Database,
  hostname: string,
): MachineRow | undefined {
  return db
    .prepare("SELECT hostname, first_seen, last_seen FROM machines WHERE hostname = ?")
    .get(hostname) as MachineRow | undefined;
}

export function getLatestSnapshot(
  db: Database.Database,
  hostname: string,
): SnapshotRow | undefined {
  return db
    .prepare(`
      SELECT * FROM snapshots
      WHERE hostname = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get(hostname) as SnapshotRow | undefined;
}

export function getSnapshots(
  db: Database.Database,
  hostname: string,
  limit = 100,
): SnapshotRow[] {
  return db
    .prepare(`
      SELECT * FROM snapshots
      WHERE hostname = ?
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(hostname, limit) as SnapshotRow[];
}

export function pruneOldSnapshots(
  db: Database.Database,
  keepPerHost = 10080,
): void {
  db.prepare(`
    DELETE FROM snapshots
    WHERE id NOT IN (
      SELECT id FROM snapshots
      WHERE hostname = snapshots.hostname
      ORDER BY created_at DESC
      LIMIT ?
    )
  `).run(keepPerHost);
}
