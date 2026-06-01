import type { FahLogState } from "./fah-log.js";
import { parseFahClientDb } from "./fah-client-db.js";
import { parseFahLog } from "./fah-log.js";

export async function collectFahStatus(
  logPath: string,
  dbPath: string,
): Promise<FahLogState> {
  const [fromDb, fromLog] = await Promise.all([
    parseFahClientDb(dbPath),
    parseFahLog(logPath),
  ]);

  if (!fromDb) return fromLog;

  return {
    project: fromDb.project ?? fromLog.project,
    run: fromDb.run ?? fromLog.run,
    clone: fromDb.clone ?? fromLog.clone,
    gen: fromDb.gen ?? fromLog.gen,
    progress: fromDb.progress ?? fromLog.progress,
    ppd: fromDb.ppd ?? fromLog.ppd,
    tpf: fromDb.tpf ?? fromLog.tpf,
    recentErrors: fromLog.recentErrors,
  };
}
