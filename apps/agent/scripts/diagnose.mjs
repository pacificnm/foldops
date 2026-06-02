#!/usr/bin/env node
/**
 * Run on a FAH node (as root): node apps/agent/scripts/diagnose.mjs
 * Or: sudo node /opt/foldops/apps/agent/scripts/diagnose.mjs
 */
import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const dbPath = process.env.FAH_DB_PATH ?? "/var/lib/fah-client/client.db";
const supervisorUrl = process.env.SUPERVISOR_URL ?? "(not set)";
const tokenSet = Boolean(process.env.AGENT_TOKEN);

console.log("=== FoldOps agent diagnose ===\n");
console.log("hostname:", (await import("node:os")).hostname());
console.log("SUPERVISOR_URL:", supervisorUrl);
console.log("AGENT_TOKEN:", tokenSet ? "set" : "MISSING");
console.log("FAH_DB_PATH:", dbPath);

try {
  await access(dbPath);
  console.log("\n[OK] client.db exists and is readable");
} catch (e) {
  console.log("\n[FAIL] client.db:", e.message);
  console.log("  Fix: sudo systemctl restart foldops-agent (runs as root)");
}

try {
  const { stdout } = await execFileAsync("sqlite3", [
    "-json",
    dbPath,
    "SELECT value FROM units",
  ]);
  const rows = JSON.parse(stdout);
  let best = null;
  for (const row of rows) {
    const u = JSON.parse(row.value)?.state;
    if (!u?.assignment?.project) continue;
    const score =
      (u.state === "RUN" ? 1000 : 0) + (u.ppd ?? 0) + (u.wu_progress ?? 0);
    if (!best || score > best.score) {
      best = {
        score,
        project: u.assignment.project,
        ppd: u.ppd,
        eta: u.eta,
        progress: u.wu_progress,
        state: u.state,
      };
    }
  }
  if (best) {
    console.log("\n[OK] sqlite3 read units — best slot:");
    console.log("  state:", best.state);
    console.log("  project:", best.project);
    console.log("  ppd:", best.ppd ?? "null");
    console.log("  eta (TPF):", best.eta ?? "null");
    console.log("  wu_progress:", best.progress ?? "null");
  } else {
    console.log("\n[WARN] units table empty or no active WU");
  }
} catch (e) {
  console.log("\n[FAIL] sqlite3:", e.message);
  console.log("  Fix: sudo apt install sqlite3");
}

if (supervisorUrl !== "(not set)" && tokenSet) {
  try {
    const res = await fetch(`${supervisorUrl.replace(/\/$/, "")}/api/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AGENT_TOKEN}`,
      },
      body: JSON.stringify({ probe: true }),
    });
    console.log("\nIngest probe HTTP status:", res.status);
    const text = await res.text();
    if (res.status === 400) console.log("  (400 expected for probe payload — auth OK)");
    else if (!res.ok) console.log("  body:", text.slice(0, 200));
    else console.log("  [OK] ingest accepted");
  } catch (e) {
    console.log("\n[FAIL] cannot POST to supervisor:", e.message);
  }
}

try {
  const { stdout } = await execFileAsync("systemctl", [
    "is-active",
    "foldops-agent",
  ]);
  console.log("\nfoldops-agent:", stdout.trim());
} catch {
  console.log("\nfoldops-agent: not active (install/start systemd unit)");
}

console.log("\n=== done ===");
