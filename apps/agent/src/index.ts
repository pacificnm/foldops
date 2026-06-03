import "dotenv/config";
import { startAgentHttp } from "./agent-http.js";
import { collectSnapshot } from "./collector.js";

const SUPERVISOR_URL = process.env.SUPERVISOR_URL ?? "http://localhost:3000";
const AGENT_TOKEN = process.env.AGENT_TOKEN;
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? "60000");
const FAH_LOG_PATH =
  process.env.FAH_LOG_PATH ?? "/var/log/fah-client/log.txt";
const FAH_DB_PATH =
  process.env.FAH_DB_PATH ?? "/var/lib/fah-client/client.db";
const FAH_WORK_DIR =
  process.env.FAH_WORK_DIR ?? "/var/lib/fah-client/work";
const AGENT_HTTP_PORT = Number(process.env.AGENT_HTTP_PORT ?? "9100");
const FOLDOPS_ROOT = process.env.FOLDOPS_ROOT ?? "/opt/foldops";
const UPDATE_SCRIPT =
  process.env.UPDATE_SCRIPT ?? `${FOLDOPS_ROOT}/scripts/update-agent.sh`;
const UPDATE_ENABLED =
  process.env.UPDATE_ENABLED === "1" ||
  process.env.UPDATE_ENABLED === "true";
const CONTROLS_ENABLED =
  process.env.CONTROLS_ENABLED === "1" ||
  process.env.CONTROLS_ENABLED === "true";
const CONTROLS_ALLOW_REBOOT =
  process.env.CONTROLS_ALLOW_REBOOT === "1" ||
  process.env.CONTROLS_ALLOW_REBOOT === "true";

if (!AGENT_TOKEN) {
  console.error("AGENT_TOKEN is required");
  process.exit(1);
}

async function postSnapshot(): Promise<void> {
  const payload = await collectSnapshot(
    FAH_LOG_PATH,
    FAH_DB_PATH,
    FAH_WORK_DIR,
  );
  const url = `${SUPERVISOR_URL.replace(/\/$/, "")}/api/ingest`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AGENT_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ingest failed (${response.status}): ${text}`);
  }

  const ppd = payload.fah.ppd ?? "n/a";
  const progress =
    payload.fah.progress != null ? `${payload.fah.progress}%` : "n/a";
  console.log(
    `[${new Date().toISOString()}] ${payload.hostname} → ingest OK (progress: ${progress}, PPD: ${ppd})`,
  );

  if (
    payload.fah.systemdStatus === "active" &&
    payload.fah.ppd == null &&
    payload.fah.progress == null &&
    payload.fah.project == null
  ) {
    console.warn(
      `[${payload.hostname}] FAH active but no metrics — check ${FAH_DB_PATH} and ${FAH_LOG_PATH}`,
    );
  }
}

async function probeSupervisor(): Promise<void> {
  try {
    const res = await fetch(
      `${SUPERVISOR_URL.replace(/\/$/, "")}/api/machines`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) {
      console.warn(`Supervisor reachable but returned ${res.status}`);
    }
  } catch (err) {
    console.error(
      `Cannot reach supervisor at ${SUPERVISOR_URL} — nodes will show offline:`,
      err,
    );
  }
}

async function run(): Promise<void> {
  console.log(
    `FoldOps agent starting (supervisor: ${SUPERVISOR_URL}, interval: ${INTERVAL_MS}ms)`,
  );

  startAgentHttp({
    port: AGENT_HTTP_PORT,
    token: AGENT_TOKEN!,
    fahLogPath: FAH_LOG_PATH,
    fahWorkDir: FAH_WORK_DIR,
    updateEnabled: UPDATE_ENABLED,
    controlsEnabled: CONTROLS_ENABLED,
    allowReboot: CONTROLS_ALLOW_REBOOT,
    foldopsRoot: FOLDOPS_ROOT,
    updateScript: UPDATE_SCRIPT,
  });

  await probeSupervisor();

  const tick = async () => {
    try {
      await postSnapshot();
    } catch (err) {
      console.error(`[${new Date().toISOString()}] ingest error:`, err);
    }
  };

  await tick();
  setInterval(tick, INTERVAL_MS);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
