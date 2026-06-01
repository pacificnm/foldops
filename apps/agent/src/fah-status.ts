import type { FahLogState } from "./fah-log.js";
import { parseFahClientDb } from "./fah-client-db.js";
import { parseFahLog } from "./fah-log.js";
import { parseFahWorkLog } from "./fah-work-log.js";

export interface FahCollectResult {
  state: FahLogState;
  dbError: string | null;
}

function mergeStates(
  primary: FahLogState | null,
  ...fallbacks: (FahLogState | null)[]
): FahLogState {
  const base: FahLogState = primary ?? {
    project: null,
    run: null,
    clone: null,
    gen: null,
    progress: null,
    ppd: null,
    tpf: null,
    recentErrors: [],
  };

  for (const fb of fallbacks) {
    if (!fb) continue;
    base.project ??= fb.project;
    base.run ??= fb.run;
    base.clone ??= fb.clone;
    base.gen ??= fb.gen;
    base.progress ??= fb.progress;
    base.ppd ??= fb.ppd;
    base.tpf ??= fb.tpf;
    if (fb.recentErrors.length > 0) {
      base.recentErrors = fb.recentErrors;
    }
  }

  return base;
}

export async function collectFahStatus(
  logPath: string,
  dbPath: string,
  workDir: string,
): Promise<FahCollectResult> {
  const dbResult = parseFahClientDb(dbPath);
  const fromLog = await parseFahLog(logPath);
  const fromWork = await parseFahWorkLog(workDir);

  const state = mergeStates(dbResult.state, fromWork, fromLog);
  state.recentErrors = fromLog.recentErrors;

  return { state, dbError: dbResult.error };
}
