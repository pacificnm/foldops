#!/usr/bin/env node
/**
 * Run on the supervisor host to test live log pull to one agent.
 * Usage: INGEST_TOKEN=... node scripts/diagnose-log-pull.mjs fah-02
 */
const hostname = process.argv[2];
if (!hostname) {
  console.error("Usage: INGEST_TOKEN=... node scripts/diagnose-log-pull.mjs <hostname>");
  process.exit(1);
}

const token = process.env.INGEST_TOKEN ?? process.env.AGENT_TOKEN;
const port = process.env.AGENT_HTTP_PORT ?? "9100";
const url = `http://${hostname}:${port}/logs/fah?lines=3`;

console.log("=== FoldOps live log pull diagnose ===\n");
console.log("hostname:", hostname);
console.log("url:", url);
console.log("INGEST_TOKEN:", token ? "set" : "MISSING");

if (!token) {
  console.error("\nSet INGEST_TOKEN (same as /etc/foldops/supervisor.env)");
  process.exit(1);
}

try {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  try {
    const { stdout } = await exec("getent", ["hosts", hostname]);
    console.log("\n[OK] name resolution:\n", stdout.trim());
  } catch {
    console.log("\n[WARN] getent hosts failed — hostname may not resolve on this machine");
  }
} catch {
  /* ignore */
}

try {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8_000),
  });
  const text = await res.text();
  console.log("\nHTTP status:", res.status);
  if (res.ok) {
    const body = JSON.parse(text);
    console.log("[OK] live pull works, lines:", body.lines?.length ?? 0);
    console.log("path:", body.path);
  } else {
    console.log("[FAIL] body:", text.slice(0, 400));
  }
} catch (err) {
  console.log("\n[FAIL] fetch error:", err.message);
  console.log("\nTypical fixes:");
  console.log("  • On agent: npm run build:agent && systemctl restart foldops-agent");
  console.log("  • On agent: journalctl -u foldops-agent | grep 'agent HTTP'");
  console.log("  • On agent: ss -tlnp | grep", port);
  console.log("  • On agent /etc/foldops/agent.env: AGENT_HTTP_PORT=" + port);
  console.log("  • From supervisor: curl -v -H 'Authorization: Bearer …' " + url);
  console.log("  • Ensure supervisor can reach agent LAN IP (ingest only needs agent→supervisor)");
  process.exit(1);
}

console.log("\n=== done ===");
