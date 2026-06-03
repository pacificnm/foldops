import type { IngestPayload } from "@foldops/shared";
import type { SnapshotRow } from "../db.js";
import type { MachineRow } from "../db.js";
import type { AlertCandidate, AlertConfig } from "./types.js";

function alertId(hostname: string, kind: string): string {
  return `${hostname}:${kind}`;
}

function errorsFingerprint(errors: string[]): string {
  return errors.slice(-5).join("\n");
}

function parsePayload(row: SnapshotRow): IngestPayload {
  return JSON.parse(row.payload) as IngestPayload;
}

export function evaluateMachine(
  machine: MachineRow,
  latest: SnapshotRow | undefined,
  online: boolean,
  config: AlertConfig,
  wasOffline: boolean,
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const host = machine.hostname;

  if (!online) {
    out.push({
      id: alertId(host, "node_offline"),
      hostname: host,
      kind: "node_offline",
      severity: "critical",
      message: `${host} is offline (no heartbeat)`,
    });
    return out;
  }

  if (wasOffline) {
    out.push({
      id: alertId(host, "node_online"),
      hostname: host,
      kind: "node_online",
      severity: "info",
      message: `${host} is back online`,
    });
  }

  if (!latest) return out;

  const payload = parsePayload(latest);
  const cpuTemp =
    latest.cpu_temp ?? payload.system.cpuTemp ?? null;
  const fahStatus = latest.fah_status;
  const errors = payload.fah.recentErrors ?? [];

  if (cpuTemp != null && cpuTemp >= config.cpuTempAlertC) {
    out.push({
      id: alertId(host, "cpu_temp_high"),
      hostname: host,
      kind: "cpu_temp_high",
      severity: "warning",
      message: `${host} CPU temperature ${cpuTemp.toFixed(1)}°C (≥ ${config.cpuTempAlertC}°C)`,
    });
  }

  if (fahStatus === "failed") {
    out.push({
      id: alertId(host, "fah_failed"),
      hostname: host,
      kind: "fah_failed",
      severity: "critical",
      message: `${host} fah-client service failed`,
    });
  } else if (fahStatus !== "active") {
    out.push({
      id: alertId(host, "fah_inactive"),
      hostname: host,
      kind: "fah_inactive",
      severity: "warning",
      message: `${host} fah-client is ${fahStatus} (not folding)`,
    });
  }

  if (errors.length > 0) {
    const fp = errorsFingerprint(errors);
    out.push({
      id: alertId(host, "fah_errors"),
      hostname: host,
      kind: "fah_errors",
      severity: "warning",
      message: `${host} reported ${errors.length} recent FAH log error(s)`,
      details: fp,
    });
  }

  return out;
}

export function evaluateFarm(
  machines: MachineRow[],
  getLatest: (hostname: string) => SnapshotRow | undefined,
  isOnline: (lastSeen: string) => boolean,
  wasOffline: (hostname: string) => boolean,
  config: AlertConfig,
): AlertCandidate[] {
  const all: AlertCandidate[] = [];
  for (const m of machines) {
    const online = isOnline(m.last_seen);
    all.push(
      ...evaluateMachine(
        m,
        getLatest(m.hostname),
        online,
        config,
        wasOffline(m.hostname),
      ),
    );
  }
  return all;
}
