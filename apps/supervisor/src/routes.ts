import { Router, type Request, type Response, type NextFunction } from "express";
import { ingestPayloadSchema, type IngestPayload } from "@foldops/shared";
import type Database from "better-sqlite3";
import { fetchLiveAgentLogs, type LogSource } from "./agent-logs.js";
import { fetchFahProject } from "./fah-projects.js";
import {
  getLatestSnapshot,
  getMachine,
  getSnapshots,
  ingestSnapshot,
  listMachines,
  type SnapshotRow,
} from "./db.js";

export interface AppConfig {
  ingestToken: string;
  offlineThresholdMs: number;
  agentHttpPort: number;
  afterIngest?: () => void;
  listAlerts?: () => { alerts: unknown[]; count: number };
}

function parsePayload(row: SnapshotRow): IngestPayload {
  return JSON.parse(row.payload) as IngestPayload;
}

function isOnline(lastSeen: string, thresholdMs: number): boolean {
  return Date.now() - new Date(lastSeen).getTime() < thresholdMs;
}

function snapshotSummary(row: SnapshotRow | undefined) {
  if (!row) return null;
  const payload = parsePayload(row);
  return {
    id: row.id,
    created_at: row.created_at,
    fah_status: row.fah_status,
    project: row.project,
    run: row.run,
    clone: row.clone,
    gen: row.gen,
    progress: row.progress,
    ppd: row.ppd,
    cpu_usage: row.cpu_usage,
    memory_percent: row.memory_percent,
    disk_percent: row.disk_percent,
    cpu_temp: row.cpu_temp ?? payload.system.cpuTemp,
    chassis_temp: row.chassis_temp ?? payload.system.chassisTemp,
    apt_updates: row.apt_updates,
    reboot_required: row.reboot_required === 1,
    payload,
  };
}

export function createApiRouter(
  db: Database.Database,
  config: AppConfig,
): Router {
  const router = Router();

  function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing bearer token" });
      return;
    }
    const token = header.slice(7);
    if (token !== config.ingestToken) {
      res.status(403).json({ error: "Invalid token" });
      return;
    }
    next();
  }

  router.post("/ingest", requireAuth, (req, res) => {
    const parsed = ingestPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid payload",
        details: parsed.error.flatten(),
      });
      return;
    }

    try {
      ingestSnapshot(db, parsed.data);
      config.afterIngest?.();
      res.json({ ok: true, hostname: parsed.data.hostname });
    } catch (err) {
      console.error("Ingest error:", err);
      res.status(500).json({ error: "Failed to store snapshot" });
    }
  });

  router.get("/machines", (_req, res) => {
    const machines = listMachines(db).map((m) => {
      const latest = getLatestSnapshot(db, m.hostname);
      const online = isOnline(m.last_seen, config.offlineThresholdMs);
      return {
        hostname: m.hostname,
        first_seen: m.first_seen,
        last_seen: m.last_seen,
        online,
        latest: snapshotSummary(latest),
      };
    });

    const farmPpd = machines.reduce((sum, m) => {
      if (!m.online || m.latest?.ppd == null) return sum;
      return sum + m.latest.ppd;
    }, 0);

    res.json({ machines, farm_ppd: Math.round(farmPpd * 100) / 100 });
  });

  router.get("/machines/:name/logs", async (req, res) => {
    const machine = getMachine(db, req.params.name);
    if (!machine) {
      res.status(404).json({ error: "Machine not found" });
      return;
    }

    const sourceParam = String(req.query.source ?? "fah");
    if (sourceParam !== "fah" && sourceParam !== "work") {
      res.status(400).json({ error: "source must be fah or work" });
      return;
    }
    const source = sourceParam as LogSource;
    const lines = Math.min(Math.max(Number(req.query.lines ?? 200), 1), 500);
    const wantLive = req.query.live !== "0";

    const latest = getLatestSnapshot(db, machine.hostname);
    const payload = latest ? parsePayload(latest) : null;
    const cached =
      source === "fah"
        ? {
            lines: payload?.logs?.fah ?? [],
            path: payload?.logs?.fahPath ?? null,
          }
        : {
            lines: payload?.logs?.work ?? [],
            path: payload?.logs?.workPath ?? null,
          };

    const online = isOnline(machine.last_seen, config.offlineThresholdMs);

    if (wantLive && online && config.agentHttpPort > 0) {
      try {
        const live = await fetchLiveAgentLogs(
          machine.hostname,
          config.agentHttpPort,
          config.ingestToken,
          source,
          lines,
        );
        res.json({
          hostname: machine.hostname,
          source,
          lines: live.lines,
          path: live.path || cached.path,
          updated_at: new Date().toISOString(),
          live: true,
          online: true,
        });
        return;
      } catch (err) {
        console.warn(
          `[logs] live fetch ${machine.hostname}/${source}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    res.json({
      hostname: machine.hostname,
      source,
      lines: cached.lines.slice(-lines),
      path: cached.path,
      updated_at: latest?.created_at ?? null,
      live: false,
      online,
      ...(wantLive && online
        ? {
            warning:
              "Live pull failed — showing last ingested snapshot. Check AGENT_HTTP_PORT and firewall.",
          }
        : {}),
    });
  });

  router.get("/machines/:name", (req, res) => {
    const machine = getMachine(db, req.params.name);
    if (!machine) {
      res.status(404).json({ error: "Machine not found" });
      return;
    }

    const latest = getLatestSnapshot(db, machine.hostname);
    res.json({
      hostname: machine.hostname,
      first_seen: machine.first_seen,
      last_seen: machine.last_seen,
      online: isOnline(machine.last_seen, config.offlineThresholdMs),
      latest: snapshotSummary(latest),
    });
  });

  router.get("/alerts", (_req, res) => {
    if (!config.listAlerts) {
      res.json({ alerts: [], count: 0 });
      return;
    }
    res.json(config.listAlerts());
  });

  router.get("/projects/:id", async (req, res) => {
    const projectId = Number(String(req.params.id).trim());
    if (!Number.isInteger(projectId) || projectId <= 0) {
      res.status(400).json({ error: "Invalid project id" });
      return;
    }

    try {
      const project = await fetchFahProject(projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json(project);
    } catch (err) {
      console.error("FAH project fetch error:", err);
      res.status(502).json({ error: "Failed to fetch project from Folding@home" });
    }
  });

  router.get("/snapshots/:name", (req, res) => {
    const machine = getMachine(db, req.params.name);
    if (!machine) {
      res.status(404).json({ error: "Machine not found" });
      return;
    }

    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const rows = getSnapshots(db, req.params.name, limit);
    res.json({
      hostname: req.params.name,
      snapshots: rows.map((row) => ({
        id: row.id,
        created_at: row.created_at,
        summary: {
          fah_status: row.fah_status,
          project: row.project,
          progress: row.progress,
          ppd: row.ppd,
          cpu_usage: row.cpu_usage,
          memory_percent: row.memory_percent,
          disk_percent: row.disk_percent,
          cpu_temp: row.cpu_temp,
          chassis_temp: row.chassis_temp,
        },
        payload: parsePayload(row),
      })),
    });
  });

  return router;
}
