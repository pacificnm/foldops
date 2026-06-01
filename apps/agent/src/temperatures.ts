import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import si from "systeminformation";

const execFileAsync = promisify(execFile);

export interface Temperatures {
  cpuTemp: number | null;
  chassisTemp: number | null;
}

const CPU_LABEL =
  /^(package id \d+|tctl|cpu|core 0|x86_pkg_temp|cpu-thermal|soc-thermal|k10temp)/i;
const CHASSIS_LABEL =
  /^(syst|system|chassis|mb|motherboard|board|tmpin0|ambient|composite|pch|chipset|nvme|acpitz)/i;

function millidegreesToC(value: number): number {
  return Math.round((value / 1000) * 10) / 10;
}

function parseTempInput(raw: string): number | null {
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  // hwmon and thermal_zone use millidegree Celsius
  if (n > 200) return millidegreesToC(n);
  return Math.round(n * 10) / 10;
}

async function readFileTrim(path: string): Promise<string | null> {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    return null;
  }
}

async function readHwmonTemps(): Promise<{
  cpu: number | null;
  chassis: number | null;
}> {
  let cpu: number | null = null;
  let chassis: number | null = null;

  let entries: string[];
  try {
    entries = await readdir("/sys/class/hwmon");
  } catch {
    return { cpu, chassis };
  }

  for (const entry of entries) {
    const base = join("/sys/class/hwmon", entry);
    const name = (await readFileTrim(join(base, "name"))) ?? entry;

    let index = 1;
    while (true) {
      const labelPath = join(base, `temp${index}_label`);
      const inputPath = join(base, `temp${index}_input`);
      const label = await readFileTrim(labelPath);
      const input = await readFileTrim(inputPath);
      if (!input) break;

      const temp = parseTempInput(input);
      if (temp == null) {
        index++;
        continue;
      }

      const tag = `${label ?? ""} ${name}`.trim();

      if (/package id/i.test(tag)) {
        cpu = temp;
      } else if (
        cpu == null &&
        (CPU_LABEL.test(tag) || name === "coretemp" || name === "k10temp")
      ) {
        cpu = temp;
      }

      if (/^syst$/i.test(label ?? "") || /^system temperature$/i.test(label ?? "")) {
        chassis = temp;
      } else if (chassis == null && CHASSIS_LABEL.test(tag)) {
        chassis = temp;
      }

      index++;
    }
  }

  return { cpu, chassis };
}

async function readThermalZoneTemps(): Promise<{
  cpu: number | null;
  chassis: number | null;
}> {
  let cpu: number | null = null;
  let chassis: number | null = null;

  let entries: string[];
  try {
    entries = await readdir("/sys/class/thermal");
  } catch {
    return { cpu, chassis };
  }

  for (const entry of entries.filter((e) => e.startsWith("thermal_zone"))) {
    const base = join("/sys/class/thermal", entry);
    const type = (await readFileTrim(join(base, "type"))) ?? "";
    const tempRaw = await readFileTrim(join(base, "temp"));
    const temp = tempRaw ? parseTempInput(tempRaw) : null;
    if (temp == null) continue;

    if (!cpu && /x86_pkg_temp|cpu-thermal|soc-thermal|Processor/i.test(type)) {
      cpu = temp;
    }
    if (!chassis && /acpitz|pch|chassis|board/i.test(type)) {
      chassis = temp;
    }
  }

  return { cpu, chassis };
}

async function readSensorsJson(): Promise<{
  cpu: number | null;
  chassis: number | null;
}> {
  let cpu: number | null = null;
  let chassis: number | null = null;

  try {
    const { stdout } = await execFileAsync("sensors", ["-j"], {
      timeout: 5000,
    });
    const data = JSON.parse(stdout) as Record<string, Record<string, unknown>>;

    for (const chip of Object.values(data)) {
      if (typeof chip !== "object" || chip === null) continue;
      for (const [sensorName, sensor] of Object.entries(chip)) {
        if (typeof sensor !== "object" || sensor === null) continue;
        const readings = sensor as Record<string, unknown>;
        for (const [key, val] of Object.entries(readings)) {
          const match = key.match(/^temp(\d+)_input$/);
          if (!match || typeof val !== "number" || val <= 0) continue;

          const labelKey = `temp${match[1]}_label`;
          const label = String(readings[labelKey] ?? sensorName);
          const temp = Math.round(val * 10) / 10;

          if (!cpu && CPU_LABEL.test(label)) cpu = temp;
          if (!chassis && CHASSIS_LABEL.test(label)) chassis = temp;
        }
      }
    }
  } catch {
    // sensors not installed or no chips
  }

  return { cpu, chassis };
}

async function readSiCpuTemp(): Promise<number | null> {
  try {
    const temp = await si.cpuTemperature();
    const candidates = [
      temp.main,
      temp.max,
      ...(temp.cores ?? []),
      ...(temp.socket ?? []),
    ].filter((t): t is number => t != null && t > 0);
    if (candidates.length === 0) return null;
    return Math.round(Math.max(...candidates) * 10) / 10;
  } catch {
    return null;
  }
}

export async function collectTemperatures(): Promise<Temperatures> {
  const [hwmon, thermal, sensors, siCpu] = await Promise.all([
    readHwmonTemps(),
    readThermalZoneTemps(),
    readSensorsJson(),
    readSiCpuTemp(),
  ]);

  const cpuTemp = hwmon.cpu ?? thermal.cpu ?? sensors.cpu ?? siCpu;
  const chassisTemp = hwmon.chassis ?? thermal.chassis ?? sensors.chassis;

  return { cpuTemp, chassisTemp };
}
