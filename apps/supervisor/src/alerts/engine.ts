import type Database from "better-sqlite3";
import { getLatestSnapshot, getSnapshotsSince, listMachines } from "../db.js";
import {
  countAlertsByStatus,
  getAlert,
  initAlertTables,
  listActiveAlerts,
  listAlertHistory,
  type AlertHistoryFilter,
  recordRecoveryAlert,
  resolveAlert,
  upsertActiveAlert,
  type AlertRow,
} from "./db.js";
import { evaluateFarm } from "./evaluate.js";
import {
  getWebhookStatus,
  sendAlertNotifications,
  sendTestNotification,
  type NotifyEvent,
} from "./notify.js";
import type {
  ActiveAlert,
  AlertCandidate,
  AlertConfig,
  AlertHistoryItem,
  AlertKind,
} from "./types.js";

function alertRowToHistoryItem(row: AlertRow): AlertHistoryItem {
  const fired = new Date(row.fired_at).getTime();
  const endMs = row.resolved_at
    ? new Date(row.resolved_at).getTime()
    : Date.now();
  return {
    id: row.id,
    hostname: row.hostname,
    kind: row.kind,
    severity: row.severity,
    message: row.message,
    active: row.active === 1,
    fired_at: row.fired_at,
    resolved_at: row.resolved_at,
    duration_ms: Math.max(0, endMs - fired),
    details: row.details,
  };
}

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
    stuckProgressHours: Math.max(
      0,
      Number(env.ALERT_STUCK_HOURS ?? "4"),
    ),
    dashboardUrl: env.ALERT_DASHBOARD_URL?.trim() || null,
    discordUsername: env.ALERT_DISCORD_USERNAME?.trim() || "FoldOps",
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

export function listAlertHistoryPublic(
  db: Database.Database,
  opts: {
    limit?: number;
    status?: AlertHistoryFilter;
    hostname?: string;
  },
): { alerts: AlertHistoryItem[]; counts: { active: number; resolved: number; total: number } } {
  const alerts = listAlertHistory(db, {
    limit: opts.limit ?? 100,
    status: opts.status ?? "all",
    hostname: opts.hostname,
  }).map(alertRowToHistoryItem);

  return {
    alerts,
    counts: countAlertsByStatus(db),
  };
}

export function getAlertsStatusPublic(config: AlertConfig): {
  enabled: boolean;
  webhook_configured: boolean;
  discord: boolean;
  dashboard_url: string | null;
  webhook: ReturnType<typeof getWebhookStatus>;
} {
  const webhookUrl = config.webhookUrl ?? "";
  return {
    enabled: config.enabled,
    webhook_configured: Boolean(config.webhookUrl),
    discord: /discord\.com\/api\/webhooks/i.test(webhookUrl),
    dashboard_url: config.dashboardUrl,
    webhook: getWebhookStatus(),
  };
}

export async function runTestAlert(config: AlertConfig): Promise<void> {
  if (!config.webhookUrl) {
    throw new Error("ALERT_WEBHOOK_URL is not set");
  }
  await sendTestNotification({
    webhookUrl: config.webhookUrl,
    username: config.discordUsername,
    dashboardUrl: config.dashboardUrl,
  });
}

function candidateToNotifyEvent(c: AlertCandidate): NotifyEvent {
  return {
    type: "fired",
    severity: c.severity,
    hostname: c.hostname,
    kind: c.kind,
    message: c.message,
    details: c.details ?? null,
  };
}

export async function runAlertEvaluation(
  db: Database.Database,
  config: AlertConfig,
): Promise<void> {
  if (!config.enabled) return;

  const machines = listMachines(db);
  const isOnline = (lastSeen: string) =>
    Date.now() - new Date(lastSeen).getTime() < config.offlineThresholdMs;

  const stuckCutoffIso =
    config.stuckProgressHours > 0
      ? new Date(
          Date.now() - config.stuckProgressHours * 3_600_000,
        ).toISOString()
      : "";

  const candidates = evaluateFarm(
    machines,
    (h) => getLatestSnapshot(db, h),
    (h) =>
      stuckCutoffIso
        ? getSnapshotsSince(db, h, stuckCutoffIso)
        : [],
    isOnline,
    (h) => wasOffline(db, h),
    config,
  );

  const candidateMap = new Map(candidates.map((c) => [c.id, c]));
  const activeRows = listActiveAlerts(db);
  const activeMap = new Map(activeRows.map((r) => [r.id, r]));

  const toFire: AlertCandidate[] = [];
  const toResolve: { id: string; message: string; kind: AlertKind; hostname: string }[] = [];

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
      kind: row.kind,
      hostname: row.hostname,
    });
  }

  const notifyEvents: NotifyEvent[] = [];
  const notifiedAt = new Date().toISOString();

  for (const c of candidates) {
    if (c.kind !== "node_online") continue;
    notifyEvents.push({
      type: "recovery",
      severity: "info",
      hostname: c.hostname,
      kind: c.kind,
      message: c.message,
    });
    recordRecoveryAlert(db, {
      id: c.id,
      hostname: c.hostname,
      message: c.message,
      notifiedAt,
    });
  }

  for (const c of toFire) {
    notifyEvents.push(candidateToNotifyEvent(c));
    upsertActiveAlert(db, {
      id: c.id,
      hostname: c.hostname,
      kind: c.kind,
      severity: c.severity,
      message: c.message,
      details: c.details ?? null,
      notifiedAt,
    });
  }

  for (const r of toResolve) {
    notifyEvents.push({
      type: "resolved",
      severity: "info",
      hostname: r.hostname,
      kind: r.kind,
      message: r.message,
    });
    resolveAlert(db, r.id, notifiedAt);
  }

  if (config.webhookUrl && notifyEvents.length > 0) {
    try {
      await sendAlertNotifications(
        {
          webhookUrl: config.webhookUrl,
          username: config.discordUsername,
          dashboardUrl: config.dashboardUrl,
        },
        notifyEvents,
      );
      console.log(
        `[alerts] sent ${notifyEvents.length} Discord/webhook notification(s)`,
      );
    } catch (err) {
      console.error("[alerts] webhook failed:", err);
    }
  } else if (notifyEvents.length > 0) {
    console.log(`[alerts] ${notifyEvents.length} event(s) (no ALERT_WEBHOOK_URL)`);
    for (const e of notifyEvents) {
      console.log(`  ${e.type}: ${e.message}`);
    }
  }
}
