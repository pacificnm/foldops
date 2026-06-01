import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { promisify } from "node:util";
import os from "node:os";
import type { IngestPayload } from "@foldops/shared";
import si from "systeminformation";
import { parseFahLog } from "./fah-log.js";

const execFileAsync = promisify(execFile);

let lastNetwork = { rxBytes: 0, txBytes: 0, at: 0 };

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function getFahSystemdStatus(): Promise<
  "active" | "inactive" | "failed" | "unknown"
> {
  try {
    const { stdout } = await execFileAsync("systemctl", [
      "is-active",
      "fah-client",
    ]);
    const status = stdout.trim();
    if (status === "active") return "active";
    if (status === "inactive") return "inactive";
    if (status === "failed") return "failed";
    return "unknown";
  } catch (err: unknown) {
    const execErr = err as { stdout?: string };
    const status = execErr.stdout?.trim();
    if (status === "inactive") return "inactive";
    if (status === "failed") return "failed";
    return "unknown";
  }
}

async function getAptUpdatesAvailable(): Promise<number> {
  try {
    const { stdout } = await execFileAsync("bash", [
      "-c",
      "apt list --upgradable 2>/dev/null | grep -c upgradable || true",
    ]);
    return Number(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

async function getCpuTemp(): Promise<number | null> {
  try {
    const temp = await si.cpuTemperature();
    if (temp.main != null && temp.main > 0) return temp.main;
    if (temp.max != null && temp.max > 0) return temp.max;
    return null;
  } catch {
    return null;
  }
}

export async function collectSnapshot(
  fahLogPath: string,
): Promise<IngestPayload> {
  const hostname = os.hostname();
  const [mem, fsSize, currentLoad, networkStats, fahLog, fahStatus] =
    await Promise.all([
      si.mem(),
      si.fsSize(),
      si.currentLoad(),
      si.networkStats(),
      parseFahLog(fahLogPath),
      getFahSystemdStatus(),
    ]);

  const rootFs =
    fsSize.find((d) => d.mount === "/") ?? fsSize[0] ?? null;
  const diskUsed = rootFs?.used ?? 0;
  const diskSize = rootFs?.size ?? 0;
  const diskFree = rootFs?.available ?? 0;

  const primaryNet =
    networkStats.find((n) => !n.iface.startsWith("lo")) ??
    networkStats[0];
  const rxBytes = primaryNet?.rx_bytes ?? 0;
  const txBytes = primaryNet?.tx_bytes ?? 0;
  const now = Date.now();
  let rxSec: number | null = null;
  let txSec: number | null = null;
  if (lastNetwork.at > 0) {
    const elapsed = (now - lastNetwork.at) / 1000;
    if (elapsed > 0) {
      rxSec = Math.max(0, (rxBytes - lastNetwork.rxBytes) / elapsed);
      txSec = Math.max(0, (txBytes - lastNetwork.txBytes) / elapsed);
    }
  }
  lastNetwork = { rxBytes, txBytes, at: now };

  const [aptUpdates, rebootRequired, cpuTemp] = await Promise.all([
    getAptUpdatesAvailable(),
    fileExists("/var/run/reboot-required"),
    getCpuTemp(),
  ]);

  const loadAvg = os.loadavg() as [number, number, number];
  const memUsed = mem.active;
  const memTotal = mem.total;

  return {
    hostname,
    timestamp: new Date().toISOString(),
    system: {
      uptime: os.uptime(),
      loadAvg,
      cpuUsage: Math.round(currentLoad.currentLoad * 10) / 10,
      memory: {
        total: memTotal,
        used: memUsed,
        free: mem.free,
        percent:
          memTotal > 0
            ? Math.round((memUsed / memTotal) * 1000) / 10
            : 0,
      },
      disk: {
        total: diskSize,
        used: diskUsed,
        free: diskFree,
        percent:
          diskSize > 0
            ? Math.round((diskUsed / diskSize) * 1000) / 10
            : 0,
      },
      network: {
        rxBytes,
        txBytes,
        rxSec,
        txSec,
      },
      cpuTemp,
    },
    fah: {
      systemdStatus: fahStatus,
      project: fahLog.project,
      run: fahLog.run,
      clone: fahLog.clone,
      gen: fahLog.gen,
      progress: fahLog.progress,
      ppd: fahLog.ppd,
      tpf: fahLog.tpf,
      recentErrors: fahLog.recentErrors,
    },
    maintenance: {
      aptUpdatesAvailable: aptUpdates,
      rebootRequired,
    },
  };
}
