import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { FahLogState } from "./fah-log.js";

const PROJECT_RE =
  /Project:\s*(\d+)\s*\(\s*Run\s*(\d+)\s*,\s*Clone\s*(\d+)\s*,\s*Gen\s*(\d+)\s*\)/i;
const STEPS_RE =
  /Completed\s+(\d+)\s+out\s+of\s+(\d+)\s+steps\s+\(([\d.]+)%\)/i;

async function findNewestWorkLog(
  workDir: string,
): Promise<string | null> {
  let newest: { path: string; mtime: number } | null = null;

  let units: string[];
  try {
    units = await readdir(workDir);
  } catch {
    return null;
  }

  for (const unit of units) {
    const unitPath = join(workDir, unit);
    let files: string[];
    try {
      files = await readdir(unitPath);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.startsWith("logfile_") || !file.endsWith(".txt")) continue;
      const path = join(unitPath, file);
      try {
        const s = await stat(path);
        if (!s.isFile()) continue;
        if (!newest || s.mtimeMs > newest.mtime) {
          newest = { path, mtime: s.mtimeMs };
        }
      } catch {
        continue;
      }
    }
  }

  return newest?.path ?? null;
}

export async function parseFahWorkLog(
  workDir: string,
): Promise<FahLogState | null> {
  const logPath = await findNewestWorkLog(workDir);
  if (!logPath) return null;

  let content: string;
  try {
    content = await readFile(logPath, "utf8");
  } catch {
    return null;
  }

  const state: FahLogState = {
    project: null,
    run: null,
    clone: null,
    gen: null,
    progress: null,
    ppd: null,
    tpf: null,
    recentErrors: [],
  };

  const lines = content.split("\n").filter(Boolean);
  const tail = lines.slice(-200);

  for (const line of tail) {
    const projectMatch = line.match(PROJECT_RE);
    if (projectMatch) {
      state.project = projectMatch[1];
      state.run = Number(projectMatch[2]);
      state.clone = Number(projectMatch[3]);
      state.gen = Number(projectMatch[4]);
    }

    const stepsMatch = line.match(STEPS_RE);
    if (stepsMatch) {
      state.progress = Number(stepsMatch[3]);
    }
  }

  if (state.project == null && state.progress == null) return null;
  return state;
}
