import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { pushAgentUpdate } from "./agent-update.js";
import {
  createDeployRun,
  type DeployHostResult,
  type DeployHostStatus,
  getDeployRun,
  updateDeployRun,
} from "./deploy-db.js";
import { listMachines } from "./db.js";

const MAX_LOG_CHARS = 12_000;

function truncateLog(text: string): string {
  if (text.length <= MAX_LOG_CHARS) return text;
  return `…${text.slice(-MAX_LOG_CHARS)}`;
}

function isOnline(lastSeen: string, thresholdMs: number): boolean {
  return Date.now() - new Date(lastSeen).getTime() < thresholdMs;
}

function initialResult(hostname: string, status: DeployHostStatus): DeployHostResult {
  return {
    hostname,
    status,
    exit_code: null,
    message: status === "offline" ? "Node offline" : "Pending",
    stdout: "",
    stderr: "",
    duration_ms: null,
    started_at: null,
    finished_at: null,
  };
}

export interface DeployConfig {
  enabled: boolean;
  agentHttpPort: number;
  ingestToken: string;
  offlineThresholdMs: number;
}

export function startAgentDeploy(
  db: Database.Database,
  config: DeployConfig,
  hostnames?: string[],
): { runId: string } | { error: string } {
  if (!config.enabled) {
    return { error: "Deploy is disabled (set DEPLOY_ENABLED=true)" };
  }
  if (config.agentHttpPort <= 0) {
    return { error: "AGENT_HTTP_PORT must be set for remote deploy" };
  }

  const machines = listMachines(db);
  const known = new Set(machines.map((m) => m.hostname));
  const targets =
    hostnames && hostnames.length > 0
      ? hostnames.filter((h) => known.has(h))
      : machines.map((m) => m.hostname);

  if (targets.length === 0) {
    return { error: "No matching machines to deploy" };
  }

  const runId = randomUUID();
  const results: Record<string, DeployHostResult> = {};
  for (const hostname of targets) {
    const machine = machines.find((m) => m.hostname === hostname)!;
    const online = isOnline(machine.last_seen, config.offlineThresholdMs);
    results[hostname] = initialResult(
      hostname,
      online ? "pending" : "offline",
    );
  }

  createDeployRun(db, runId, targets, results);
  void runDeployJob(db, config, runId, targets);

  return { runId };
}

async function runDeployJob(
  db: Database.Database,
  config: DeployConfig,
  runId: string,
  targets: string[],
): Promise<void> {
  const machines = listMachines(db);

  const patchHost = (
    hostname: string,
    patch: Partial<DeployHostResult>,
  ): void => {
    const run = getDeployRun(db, runId);
    if (!run) return;
    run.results[hostname] = { ...run.results[hostname], ...patch };
    updateDeployRun(db, runId, "running", run.results);
  };

  await Promise.all(
    targets.map(async (hostname) => {
      const machine = machines.find((m) => m.hostname === hostname);
      const run = getDeployRun(db, runId);
      if (!run || !machine || run.results[hostname].status === "offline") {
        return;
      }

      patchHost(hostname, {
        status: "running",
        message: "Running update…",
        started_at: new Date().toISOString(),
      });

      try {
        const result = await pushAgentUpdate(
          hostname,
          config.agentHttpPort,
          config.ingestToken,
        );

        const finishedAt = new Date().toISOString();
        if (result.ok) {
          patchHost(hostname, {
            status: "success",
            exit_code: result.exit_code,
            stdout: truncateLog(result.stdout),
            stderr: truncateLog(result.stderr),
            duration_ms: result.duration_ms,
            finished_at: finishedAt,
            message: result.restarting
              ? "Updated; agent restarted"
              : "Update completed",
          });
        } else {
          patchHost(hostname, {
            status: "failed",
            exit_code: result.exit_code,
            stdout: truncateLog(result.stdout),
            stderr: truncateLog(result.stderr),
            duration_ms: result.duration_ms,
            finished_at: finishedAt,
            message: `Update failed (exit ${result.exit_code})`,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const likelyRestart =
          /ECONNRESET|socket hang up|fetch failed|aborted/i.test(msg);
        const finishedAt = new Date().toISOString();

        if (likelyRestart) {
          patchHost(hostname, {
            status: "success",
            exit_code: 0,
            stderr: truncateLog(msg),
            finished_at: finishedAt,
            message: "Agent restarted (connection closed during deploy)",
          });
        } else {
          patchHost(hostname, {
            status: "failed",
            stderr: truncateLog(msg),
            finished_at: finishedAt,
            message: msg,
          });
        }
      }
    }),
  );

  const finalRun = getDeployRun(db, runId);
  if (!finalRun) return;

  const values = Object.values(finalRun.results);
  const attempted = values.filter((r) => r.status !== "offline");
  const allFailed =
    attempted.length > 0 &&
    attempted.every((r) => r.status === "failed");

  updateDeployRun(
    db,
    runId,
    allFailed ? "failed" : "completed",
    finalRun.results,
  );
}
