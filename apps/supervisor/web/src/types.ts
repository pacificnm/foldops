export interface MachineSummary {
  hostname: string;
  first_seen: string;
  last_seen: string;
  online: boolean;
  latest: {
    created_at: string;
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
    cpu_temp: number | null;
    chassis_temp: number | null;
    apt_updates: number;
    reboot_required: boolean;
    payload?: {
      fah: { tpf: string | null; recentErrors: string[] };
      system: {
        loadAvg: [number, number, number];
        uptime: number;
        cpuTemp: number | null;
        chassisTemp: number | null;
      };
    };
  } | null;
}

export interface MachinesResponse {
  machines: MachineSummary[];
  farm_ppd: number;
}

export type AlertSeverity = "info" | "warning" | "critical";

export type AlertKind =
  | "node_offline"
  | "node_online"
  | "cpu_temp_high"
  | "fah_inactive"
  | "fah_failed"
  | "fah_errors";

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

export interface AlertsResponse {
  alerts: ActiveAlert[];
  count: number;
}

export interface FahProjectInfo {
  project: number;
  manager: string | null;
  cause: string | null;
  institution: string | null;
  description: string | null;
  projectRange: string | null;
  modified: string | null;
  statsUrl: string;
}

export interface SnapshotSummary {
  fah_status: string;
  project: string | null;
  progress: number | null;
  ppd: number | null;
  cpu_usage: number | null;
  memory_percent: number | null;
  disk_percent: number | null;
  cpu_temp: number | null;
  chassis_temp: number | null;
}

export interface SnapshotRecord {
  id: number;
  created_at: string;
  summary: SnapshotSummary;
}

export interface SnapshotsResponse {
  hostname: string;
  snapshots: SnapshotRecord[];
}

export interface HistoryPoint {
  time: string;
  label: string;
  progress: number | null;
  ppd: number | null;
  cpu: number | null;
  memory: number | null;
  disk: number | null;
  cpuTemp: number | null;
  chassisTemp: number | null;
}
