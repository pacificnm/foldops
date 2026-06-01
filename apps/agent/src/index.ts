import "dotenv/config";
import { collectSnapshot } from "./collector.js";

const SUPERVISOR_URL = process.env.SUPERVISOR_URL ?? "http://localhost:3000";
const AGENT_TOKEN = process.env.AGENT_TOKEN;
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? "60000");
const FAH_LOG_PATH =
  process.env.FAH_LOG_PATH ?? "/var/log/fah-client/log.txt";
const FAH_DB_PATH =
  process.env.FAH_DB_PATH ?? "/var/lib/fah-client/client.db";

if (!AGENT_TOKEN) {
  console.error("AGENT_TOKEN is required");
  process.exit(1);
}

async function postSnapshot(): Promise<void> {
  const payload = await collectSnapshot(FAH_LOG_PATH, FAH_DB_PATH);
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

  console.log(
    `[${new Date().toISOString()}] ${payload.hostname} → ingest OK (PPD: ${payload.fah.ppd ?? "n/a"})`,
  );
}

async function run(): Promise<void> {
  console.log(
    `FoldOps agent starting (supervisor: ${SUPERVISOR_URL}, interval: ${INTERVAL_MS}ms)`,
  );

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
