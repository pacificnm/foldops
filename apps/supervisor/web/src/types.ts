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
    apt_updates: number;
    reboot_required: boolean;
    payload?: {
      fah: { tpf: string | null; recentErrors: string[] };
      system: { loadAvg: [number, number, number]; uptime: number };
    };
  } | null;
}

export interface MachinesResponse {
  machines: MachineSummary[];
  farm_ppd: number;
}
