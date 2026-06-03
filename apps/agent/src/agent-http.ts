import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { readLogTail } from "./log-tail.js";
import { getNewestWorkLogPath } from "./fah-work-log.js";
import { isUpdateInFlight, restartFoldopsAgent, runAgentUpdate } from "./run-update.js";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function parseAuth(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  return header.slice(7) === token;
}

export function startAgentHttp(opts: {
  port: number;
  token: string;
  fahLogPath: string;
  fahWorkDir: string;
  updateEnabled: boolean;
  foldopsRoot: string;
  updateScript: string;
}): void {
  if (opts.port <= 0) return;

  const server = createServer(async (req, res) => {
    if (!req.url) {
      sendJson(res, 400, { error: "Bad request" });
      return;
    }

    if (!parseAuth(req, opts.token)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    const url = new URL(req.url, "http://127.0.0.1");

    if (req.method === "POST" && url.pathname === "/update") {
      if (!opts.updateEnabled) {
        sendJson(res, 403, { error: "Updates disabled (set UPDATE_ENABLED=true)" });
        return;
      }
      if (isUpdateInFlight()) {
        sendJson(res, 409, { error: "Update already in progress" });
        return;
      }

      try {
        const result = await runAgentUpdate({
          root: opts.foldopsRoot,
          scriptPath: opts.updateScript,
        });

        if (!result.ok) {
          sendJson(res, 200, {
            ok: false,
            exit_code: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            duration_ms: result.durationMs,
          });
          return;
        }

        sendJson(res, 200, {
          ok: true,
          exit_code: 0,
          stdout: result.stdout,
          stderr: result.stderr,
          duration_ms: result.durationMs,
          restarting: true,
        });

        setTimeout(() => {
          restartFoldopsAgent().catch((err) => {
            console.error("[agent-http] restart failed:", err);
          });
        }, 400);
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : "Update failed",
        });
      }
      return;
    }

    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const match = url.pathname.match(/^\/logs\/(fah|work)$/);
    if (!match) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const source = match[1] as "fah" | "work";
    const lines = Math.min(Math.max(Number(url.searchParams.get("lines") ?? 200), 1), 500);

    try {
      if (source === "fah") {
        const tail = await readLogTail(opts.fahLogPath, lines);
        if (!tail) {
          sendJson(res, 404, { error: "FAH log not readable", path: opts.fahLogPath });
          return;
        }
        sendJson(res, 200, { source, path: tail.path, lines: tail.lines });
        return;
      }

      const workPath = await getNewestWorkLogPath(opts.fahWorkDir);
      if (!workPath) {
        sendJson(res, 404, { error: "No work unit log found" });
        return;
      }
      const tail = await readLogTail(workPath, lines);
      if (!tail) {
        sendJson(res, 404, { error: "Work log not readable", path: workPath });
        return;
      }
      sendJson(res, 200, { source, path: tail.path, lines: tail.lines });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : "Failed to read log",
      });
    }
  });

  const endpoints = ["/logs/fah", "/logs/work"];
  if (opts.updateEnabled) endpoints.push("POST /update");

  server.listen(opts.port, "0.0.0.0", () => {
    console.log(
      `FoldOps agent HTTP on 0.0.0.0:${opts.port} (${endpoints.join(", ")})`,
    );
  });
}
