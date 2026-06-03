import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ControlAction } from "./control-actions.js";
import { sendFahControlCommand } from "./fah-control.js";
import { restartFoldopsAgent } from "./run-update.js";

const execFileAsync = promisify(execFile);

export interface ControlResult {
  ok: boolean;
  action: ControlAction;
  message: string;
  stdout: string;
  stderr: string;
}

export interface ControlStatus {
  foldops_agent: string;
  fah_client: string;
}

export async function getControlStatus(): Promise<ControlStatus> {
  return {
    foldops_agent: await systemdIsActive("foldops-agent"),
    fah_client: await systemdIsActive("fah-client"),
  };
}

async function systemdIsActive(unit: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("systemctl", ["is-active", unit]);
    return stdout.trim();
  } catch (err: unknown) {
    const execErr = err as { stdout?: string };
    return execErr.stdout?.trim() ?? "inactive";
  }
}

async function runSystemctl(
  args: ["start" | "stop" | "restart", string],
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync("systemctl", args, {
    timeout: 60_000,
  });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

export async function executeControlAction(
  action: ControlAction,
  opts: { allowReboot: boolean },
): Promise<ControlResult> {
  const fail = (
    message: string,
    stdout = "",
    stderr = "",
  ): ControlResult => ({
    ok: false,
    action,
    message,
    stdout,
    stderr,
  });

  try {
    switch (action) {
      case "agent.start": {
        const r = await runSystemctl(["start", "foldops-agent"]);
        return {
          ok: true,
          action,
          message: "foldops-agent started",
          stdout: r.stdout,
          stderr: r.stderr,
        };
      }
      case "agent.stop": {
        const r = await runSystemctl(["stop", "foldops-agent"]);
        return {
          ok: true,
          action,
          message: "foldops-agent stopped",
          stdout: r.stdout,
          stderr: r.stderr,
        };
      }
      case "agent.restart": {
        return {
          ok: true,
          action,
          message: "foldops-agent will restart",
          stdout: "",
          stderr: "",
        };
      }
      case "fah.start": {
        const r = await runSystemctl(["start", "fah-client"]);
        return {
          ok: true,
          action,
          message: "fah-client started",
          stdout: r.stdout,
          stderr: r.stderr,
        };
      }
      case "fah.stop": {
        const r = await runSystemctl(["stop", "fah-client"]);
        return {
          ok: true,
          action,
          message: "fah-client stopped",
          stdout: r.stdout,
          stderr: r.stderr,
        };
      }
      case "fah.restart": {
        const r = await runSystemctl(["restart", "fah-client"]);
        return {
          ok: true,
          action,
          message: "fah-client restarted",
          stdout: r.stdout,
          stderr: r.stderr,
        };
      }
      case "fah.pause": {
        const r = await sendFahControlCommand("pause");
        return {
          ok: r.ok,
          action,
          message: r.message,
          stdout: "",
          stderr: r.ok ? "" : r.message,
        };
      }
      case "fah.resume": {
        const r = await sendFahControlCommand("fold");
        return {
          ok: r.ok,
          action,
          message: r.ok ? "FAH folding resumed" : r.message,
          stdout: "",
          stderr: r.ok ? "" : r.message,
        };
      }
      case "fah.finish": {
        const r = await sendFahControlCommand("finish");
        return {
          ok: r.ok,
          action,
          message: r.ok ? "FAH finish command sent (completes WU then pauses)" : r.message,
          stdout: "",
          stderr: r.ok ? "" : r.message,
        };
      }
      case "host.reboot": {
        if (!opts.allowReboot) {
          return fail("Host reboot disabled (set CONTROLS_ALLOW_REBOOT=true)");
        }
        await execFileAsync("systemctl", ["reboot"], { timeout: 5_000 });
        return {
          ok: true,
          action,
          message: "Reboot initiated",
          stdout: "",
          stderr: "",
        };
      }
      default:
        return fail(`Unknown action: ${action}`);
    }
  } catch (err: unknown) {
    const execErr = err as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return fail(
      execErr.message ?? String(err),
      (execErr.stdout ?? "").trim(),
      (execErr.stderr ?? "").trim(),
    );
  }
}

/** Restart foldops-agent after HTTP response (agent.restart from HTTP handler). */
export function scheduleAgentSelfRestart(): void {
  setTimeout(() => {
    restartFoldopsAgent().catch((err) => {
      console.error("[control] agent restart failed:", err);
    });
  }, 400);
}
