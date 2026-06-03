import type Database from "better-sqlite3";
import { getLatestSnapshot, listMachines } from "../db.js";
import { getAlert, initAlertTables, listActiveAlerts, resolveAlert, upsertActiveAlert } from "./db.js";
import { evaluateFarm } from "./evaluate.js";
import { sendWebhookAlert } from "./notify.js";
import type { ActiveAlert, AlertCandidate, AlertConfig } from "./types.js";

function wasOffline(db: Database.Database, hostname: string): boolean {
  const row = getAlert(db, `${hostname}:node_offline`);
  return row?.active === 1;
}

export function loadAlertConfig(env: NodeJS.ProcessEnv): AlertConfig {
  const webhookUrl = env.ALERT_WEBHOOK_URL?.trim() || null;
  const enabled =
    env.ALERTS_ENABLED === "1" ||
    env.ALERTS_ENABLED === "true" ||
    Boolean(webhookUrl);

  return {
    enabled,
    webhookUrl,
    offlineThresholdMs: Number(env.OFFLINE_THRESHOLD_MS ?? "120000"),
    cpuTempAlertC: Number(env.CPU_TEMP_ALERT_C ?? "85"),
  };
}

export function initAlerts(db: Database.Database): void {
  initAlertTables(db);
}

export function listActiveAlertsPublic(db: Database.Database): ActiveAlert[] {
  return listActiveAlerts(db).map((r) => ({
    id: r.id,
    hostname: r.hostname,
    kind: r.kind,
    severity: r.severity,
    message: r.message,
    active: r.active === 1,
    since: r.fired_at,
    resolved_at: r.resolved_at,
  }));
}

export async function runAlertEvaluation(
  db: Database.Database,
  config: AlertConfig,
): Promise<void> {
  if (!config.enabled) return;

  const machines = listMachines(db);
  const isOnline = (lastSeen: string) =>
    Date.now() - new Date(lastSeen).getTime() < config.offlineThresholdMs;

  const candidates = evaluateFarm(
    machines,
    (h) => getLatestSnapshot(db, h),
    isOnline,
    (h) => wasOffline(db, h),
    config,
  );

  const candidateMap = new Map(candidates.map((c) => [c.id, c]));
  const activeRows = listActiveAlerts(db);
  const activeMap = new Map(activeRows.map((r) => [r.id, r]));

  const toFire: AlertCandidate[] = [];
  const toResolve: { id: string; message: string }[] = [];

  for (const c of candidates) {
    if (c.kind === "node_online") continue;

    const prev = activeMap.get(c.id);
    if (!prev) {
      toFire.push(c);
      continue;
    }
    if (c.kind === "fah_errors" && c.details && c.details !== prev.details) {
      toFire.push(c);
    }
  }

  for (const row of activeRows) {
    if (candidateMap.has(row.id)) continue;
    toResolve.push({
      id: row.id,
      message: `Resolved: ${row.message}`,
    });
  }

  const notifyLines: string[] = [];

  for (const c of candidates) {
    if (c.kind !== "node_online") continue;
    notifyLines.push(`🟢 **FoldOps** — ${c.message}`);
  }

  for (const c of toFire) {
    const prefix =
      c.severity === "critical"
        ? "🔴"
        : c.severity === "warning"
          ? "🟡"
          : "🟢";
    notifyLines.push(`${prefix} **FoldOps** — ${c.message}`);
    upsertActiveAlert(db, {
      id: c.id,
      hostname: c.hostname,
      kind: c.kind,
      severity: c.severity,
      message: c.message,
      details: c.details ?? null,
      notifiedAt: new Date().toISOString(),
    });
  }

  for (const r of toResolve) {
    notifyLines.push(`✅ **FoldOps** — ${r.message}`);
    resolveAlert(db, r.id, new Date().toISOString());
  }

  if (config.webhookUrl && notifyLines.length > 0) {
    try {
      await sendWebhookAlert(config.webhookUrl, notifyLines);
      console.log(`[alerts] sent ${notifyLines.length} notification(s)`);
    } catch (err) {
      console.error("[alerts] webhook failed:", err);
    }
  } else if (notifyLines.length > 0) {
    console.log(`[alerts] ${notifyLines.length} event(s) (no ALERT_WEBHOOK_URL)`);
    for (const line of notifyLines) {
      console.log(`  ${line.replace(/\*\*/g, "")}`);
    }
  }
}
