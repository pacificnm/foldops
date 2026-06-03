import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

let updateInFlight = false;

export interface UpdateResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

async function fileExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function isUpdateInFlight(): boolean {
  return updateInFlight;
}

export async function runAgentUpdate(opts: {
  root: string;
  scriptPath: string;
}): Promise<UpdateResult> {
  if (updateInFlight) {
    throw new Error("Update already in progress");
  }

  updateInFlight = true;
  const started = Date.now();

  try {
    if (!(await fileExecutable(opts.scriptPath))) {
      throw new Error(`Update script not found or not executable: ${opts.scriptPath}`);
    }

    const { stdout, stderr } = await execFileAsync("bash", [opts.scriptPath], {
      cwd: opts.root,
      env: { ...process.env, FOLDOPS_ROOT: opts.root },
      maxBuffer: 4 * 1024 * 1024,
      timeout: 600_000,
    });

    return {
      ok: true,
      exitCode: 0,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      durationMs: Date.now() - started,
    };
  } catch (err: unknown) {
    const execErr = err as {
      code?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    const exitCode =
      typeof execErr.code === "number" ? execErr.code : 1;
    return {
      ok: false,
      exitCode,
      stdout: (execErr.stdout ?? "").trim(),
      stderr: (execErr.stderr ?? execErr.message ?? String(err)).trim(),
      durationMs: Date.now() - started,
    };
  } finally {
    updateInFlight = false;
  }
}

export async function restartFoldopsAgent(): Promise<void> {
  await execFileAsync("systemctl", ["restart", "foldops-agent"], {
    timeout: 30_000,
  });
}
