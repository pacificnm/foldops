import { Router, type Request, type Response, type NextFunction } from "express";
import { ingestPayloadSchema, type IngestPayload } from "@foldops/shared";
import type Database from "better-sqlite3";
import {
  fetchAgentControlStatus,
  pushAgentControl,
} from "./agent-control.js";
import { fetchLiveAgentLogs, type LogSource } from "./agent-logs.js";
import { isControlAction } from "@foldops/shared";
import { startAgentDeploy } from "./deploy.js";
import { getDeployRun, listDeployRuns } from "./deploy-db.js";
import {
  getAlertsStatusPublic,
  listAlertHistoryPublic,
  runTestAlert,
} from "./alerts/engine.js";
import type { AlertConfig } from "./alerts/types.js";
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
  deployEnabled: boolean;
  controlEnabled: boolean;
  afterIngest?: () => void;
  listAlerts?: () => { alerts: unknown[]; count: number };
  alertConfig: AlertConfig;
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
        const liveError =
          err instanceof Error ? err.message : String(err);
        console.warn(
          `[logs] live fetch ${machine.hostname}/${source}: ${liveError}`,
        );
        res.json({
          hostname: machine.hostname,
          source,
          lines: cached.lines.slice(-lines),
          path: cached.path,
          updated_at: latest?.created_at ?? null,
          live: false,
          online: true,
          live_error: liveError,
          live_url: `http://${machine.hostname}:${config.agentHttpPort}/logs/${source}`,
          warning: `Live pull failed: ${liveError}`,
        });
        return;
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
    });
  });

  router.get("/machines/:name/control/status", async (req, res) => {
    const machine = getMachine(db, req.params.name);
    if (!machine) {
      res.status(404).json({ error: "Machine not found" });
      return;
    }
    if (!config.controlEnabled) {
      res.status(403).json({ error: "Remote control disabled (set CONTROL_ENABLED=true)" });
      return;
    }
    if (!isOnline(machine.last_seen, config.offlineThresholdMs)) {
      res.status(503).json({ error: "Node offline" });
      return;
    }

    try {
      const status = await fetchAgentControlStatus(
        machine.hostname,
        config.agentHttpPort,
        config.ingestToken,
      );
      res.json({ hostname: machine.hostname, ...status });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: message });
    }
  });

  router.post("/machines/:name/control", async (req, res) => {
    const machine = getMachine(db, req.params.name);
    if (!machine) {
      res.status(404).json({ error: "Machine not found" });
      return;
    }
    if (!config.controlEnabled) {
      res.status(403).json({ error: "Remote control disabled (set CONTROL_ENABLED=true)" });
      return;
    }
    if (!isOnline(machine.last_seen, config.offlineThresholdMs)) {
      res.status(503).json({ error: "Node offline" });
      return;
    }

    const action = (req.body as { action?: string })?.action;
    if (!action || !isControlAction(action)) {
      res.status(400).json({ error: "Invalid or missing action" });
      return;
    }

    try {
      const result = await pushAgentControl(
        machine.hostname,
        config.agentHttpPort,
        config.ingestToken,
        action,
      );
      res.json({ hostname: machine.hostname, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const likelyRestart =
        action === "agent.restart" &&
        /ECONNRESET|socket hang up|fetch failed/i.test(message);
      if (likelyRestart) {
        res.json({
          hostname: machine.hostname,
          ok: true,
          action,
          message: "Agent restarted (connection closed)",
          stdout: "",
          stderr: message,
        });
        return;
      }
      res.status(502).json({ error: message });
    }
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

  router.get("/deploy/runs", (_req, res) => {
    res.json({ runs: listDeployRuns(db, 25) });
  });

  router.get("/deploy/runs/:id", (req, res) => {
    const run = getDeployRun(db, req.params.id);
    if (!run) {
      res.status(404).json({ error: "Deploy run not found" });
      return;
    }
    res.json(run);
  });

  router.post("/deploy/agents", (req, res) => {
    if (!config.deployEnabled) {
      res.status(403).json({ error: "Deploy is disabled (set DEPLOY_ENABLED=true)" });
      return;
    }

    const body = (req.body ?? {}) as { hostnames?: string[] };
    const hostnames = Array.isArray(body.hostnames)
      ? body.hostnames.filter((h) => typeof h === "string" && h.length > 0)
      : undefined;

    const result = startAgentDeploy(
      db,
      {
        enabled: config.deployEnabled,
        agentHttpPort: config.agentHttpPort,
        ingestToken: config.ingestToken,
        offlineThresholdMs: config.offlineThresholdMs,
      },
      hostnames,
    );

    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(202).json({ run_id: result.runId, status: "running" });
  });

  router.get("/alerts/status", (_req, res) => {
    res.json(getAlertsStatusPublic(config.alertConfig));
  });

  router.post("/alerts/test", async (_req, res) => {
    if (!config.alertConfig.webhookUrl) {
      res.status(400).json({ error: "ALERT_WEBHOOK_URL is not set" });
      return;
    }
    if (!config.alertConfig.enabled) {
      res.status(400).json({
        error: "Alerts disabled — set ALERTS_ENABLED=true or ALERT_WEBHOOK_URL",
      });
      return;
    }

    try {
      await runTestAlert(config.alertConfig);
      res.json({
        ok: true,
        message: "Test notification sent",
        status: getAlertsStatusPublic(config.alertConfig),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: message });
    }
  });

  router.get("/alerts/history", (req, res) => {
    const statusParam = String(req.query.status ?? "all");
    const status =
      statusParam === "active" ||
      statusParam === "resolved" ||
      statusParam === "all"
        ? statusParam
        : "all";
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const hostname = req.query.hostname
      ? String(req.query.hostname).trim()
      : undefined;

    const { alerts, counts } = listAlertHistoryPublic(db, {
      limit,
      status,
      hostname: hostname || undefined,
    });

    res.json({ alerts, count: alerts.length, counts, status });
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
