import { readFile } from "node:fs/promises";

export interface FahLogState {
  project: string | null;
  run: number | null;
  clone: number | null;
  gen: number | null;
  progress: number | null;
  ppd: number | null;
  tpf: string | null;
  recentErrors: string[];
}

const PROJECT_RE =
  /Project:\s*(\d+)\s*\(\s*Run\s*(\d+)\s*,\s*Clone\s*(\d+)\s*,\s*Gen\s*(\d+)\s*\)/i;
const PROGRESS_RE = /Progress:\s*([\d.]+)\s*%/i;
const PPD_RE = /PPD[:\s]+([\d,.]+)/i;
const TPF_RE = /TPF[:\s]+([\d:]+(?:\.\d+)?)/i;
const ERROR_RE = /\b(ERROR|FATAL|Exception|failed)\b/i;

export async function parseFahLog(logPath: string): Promise<FahLogState> {
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

  let content: string;
  try {
    content = await readFile(logPath, "utf8");
  } catch {
    return state;
  }

  const lines = content.split("\n").filter(Boolean);
  const tail = lines.slice(-500);

  for (const line of tail) {
    const projectMatch = line.match(PROJECT_RE);
    if (projectMatch) {
      state.project = projectMatch[1];
      state.run = Number(projectMatch[2]);
      state.clone = Number(projectMatch[3]);
      state.gen = Number(projectMatch[4]);
    }

    const progressMatch = line.match(PROGRESS_RE);
    if (progressMatch) {
      state.progress = Number(progressMatch[1]);
    }

    const ppdMatch = line.match(PPD_RE);
    if (ppdMatch) {
      state.ppd = Number(ppdMatch[1].replace(/,/g, ""));
    }

    const tpfMatch = line.match(TPF_RE);
    if (tpfMatch) {
      state.tpf = tpfMatch[1];
    }

    if (ERROR_RE.test(line)) {
      state.recentErrors.push(line.trim());
    }
  }

  state.recentErrors = state.recentErrors.slice(-10);
  return state;
}
