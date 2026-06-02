import type { FahLogState } from "./fah-log.js";
import { parseFahClientDb } from "./fah-client-db.js";
import { parseFahLog } from "./fah-log.js";
import { parseFahWorkLog } from "./fah-work-log.js";

export interface FahCollectResult {
  state: FahLogState;
  dbError: string | null;
  dbSource: string | null;
}

const emptyFahState = (): FahLogState => ({
  project: null,
  run: null,
  clone: null,
  gen: null,
  progress: null,
  ppd: null,
  tpf: null,
  recentErrors: [],
});

function mergeField<T>(current: T | null, incoming: T | null): T | null {
  return current ?? incoming;
}

/** Prefer the larger progress when both sources report folding. */
function mergeProgress(
  current: number | null,
  incoming: number | null,
): number | null {
  if (incoming == null || incoming <= 0) return current;
  if (current == null || current <= 0) return incoming;
  return Math.max(current, incoming);
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
    base.project = mergeField(base.project, fb.project);
    base.run = mergeField(base.run, fb.run);
    base.clone = mergeField(base.clone, fb.clone);
    base.gen = mergeField(base.gen, fb.gen);
    base.progress = mergeProgress(base.progress, fb.progress);
    base.ppd = mergeField(base.ppd, fb.ppd);
    base.tpf = mergeField(base.tpf, fb.tpf);
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
  let dbResult: Awaited<ReturnType<typeof parseFahClientDb>>;
  try {
    dbResult = await parseFahClientDb(dbPath);
  } catch (err) {
    dbResult = {
      state: null,
      error: `client.db read failed: ${err}`,
      source: null,
    };
  }

  const fromLog = await parseFahLog(logPath).catch(() => emptyFahState());
  const fromWork = await parseFahWorkLog(workDir).catch(() => null);

  // Work/main logs first; client.db last so RUN/PPD from SQLite wins when populated.
  // During CORE (DB empty), v8 step lines in log.txt still show project/progress.
  const state = mergeStates(fromWork, fromLog, dbResult.state);
  state.recentErrors = fromLog.recentErrors;

  return {
    state,
    dbError: dbResult.error,
    dbSource: dbResult.source,
  };
}
