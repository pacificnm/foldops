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
  console.log(`\n[OK] sqlite3 — ${rows.length} unit row(s) in client.db`);

  function unitState(raw) {
    if (!raw || typeof raw !== "object") return null;
    const inner = raw.state;
    if (inner && typeof inner === "object" && !Array.isArray(inner)) return inner;
    if (
      typeof inner === "string" ||
      "wu_progress" in raw ||
      "ppd" in raw ||
      "assignment" in raw
    ) {
      return raw;
    }
    return null;
  }

  function projectOf(u) {
    return (
      u?.assignment?.project ??
      u?.assignment?.data?.project ??
      u?.data?.assignment?.data?.project ??
      u?.project ??
      null
    );
  }

  let best = null;
  for (let i = 0; i < rows.length; i++) {
    const u = unitState(JSON.parse(rows[i].value));
    const slot = u?.number ?? i;
    const status = u?.state ?? "(no state)";
    const project = projectOf(u);
    const ppd = u?.ppd ?? null;
    const progress = u?.wu_progress ?? u?.progress ?? null;
    console.log(
      `  slot ${slot}: status=${status} project=${project ?? "—"} ppd=${ppd ?? "—"} progress=${progress ?? "—"}`,
    );
    if (status === "CORE" && !ppd && !project) {
      console.log(
        "    (CORE = FahCore starting or running; wait for RUN + project, or check /var/log/fah-client)",
      );
    }
    const progressNum =
      progress != null ? (progress <= 1 ? progress * 100 : progress) : 0;
    const hasMetrics =
      (ppd != null && ppd > 0) ||
      Boolean(u?.eta?.trim()) ||
      progressNum > 0;
    if (!project && !hasMetrics) continue;
    const score =
      (u?.state === "RUN" ? 1000 : 0) + (ppd ?? 0) + (progress ?? 0);
    if (!best || score > best.score) {
      best = {
        score,
        project,
        ppd,
        eta: u?.eta,
        progress,
        state: u?.state,
      };
    }
  }
  if (best) {
    console.log("\n[OK] best slot for dashboard PPD/TPF:");
    console.log("  state:", best.state);
    console.log("  project:", best.project ?? "(none — PPD/progress only)");
    console.log("  ppd:", best.ppd ?? "null");
    console.log("  eta (TPF):", best.eta ?? "null");
    console.log("  wu_progress:", best.progress ?? "null");
  } else if (rows.length === 0) {
    console.log("\n[WARN] units table is empty — fah-client may not be configured yet");
  } else {
    console.log(
      "\n[WARN] no folding metrics yet (e.g. status=CORE/RUN with ppd=0) —",
    );
    console.log(
      "  check fah-client logs and https://app.foldingathome.org/ for this machine; compare with a working node",
    );
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
    "fah-client",
  ]);
  console.log("\nfah-client:", stdout.trim());
} catch {
  console.log("\nfah-client: not active");
}

try {
  const { stdout } = await execFileAsync("systemctl", [
    "is-active",
    "foldops-agent",
  ]);
  console.log("foldops-agent:", stdout.trim());
} catch {
  console.log("foldops-agent: not active (install/start systemd unit)");
}

console.log("\n=== done ===");
