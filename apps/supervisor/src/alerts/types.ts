export type AlertSeverity = "info" | "warning" | "critical";

export type AlertKind =
  | "node_offline"
  | "node_online"
  | "cpu_temp_high"
  | "fah_inactive"
  | "fah_failed"
  | "fah_errors"
  | "fah_stuck";

export interface AlertCandidate {
  id: string;
  hostname: string;
  kind: AlertKind;
  severity: AlertSeverity;
  message: string;
  details?: string;
}

export interface ActiveAlert {
  id: string;
  hostname: string;
  kind: AlertKind;
  severity: AlertSeverity;
  message: string;
  active: boolean;
  since: string;
  resolved_at: string | null;
}

export interface AlertHistoryItem {
  id: string;
  hostname: string;
  kind: AlertKind;
  severity: AlertSeverity;
  message: string;
  active: boolean;
  fired_at: string;
  resolved_at: string | null;
  duration_ms: number;
  details: string | null;
}

export interface AlertConfig {
  enabled: boolean;
  webhookUrl: string | null;
  offlineThresholdMs: number;
  cpuTempAlertC: number;
  stuckProgressHours: number;
  dashboardUrl: string | null;
  discordUsername: string;
}
