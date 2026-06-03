import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  initAlerts,
  listActiveAlertsPublic,
  loadAlertConfig,
  runAlertEvaluation,
} from "./alerts/engine.js";
import { initDb } from "./db.js";
import { createApiRouter } from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? "3000");
const HOST = process.env.HOST ?? "0.0.0.0";
const DB_PATH = process.env.DB_PATH ?? "./data/foldops.db";
const INGEST_TOKEN = process.env.INGEST_TOKEN;
const OFFLINE_THRESHOLD_MS = Number(process.env.OFFLINE_THRESHOLD_MS ?? "120000");
const AGENT_HTTP_PORT = Number(process.env.AGENT_HTTP_PORT ?? "9100");

if (!INGEST_TOKEN) {
  console.error("INGEST_TOKEN is required");
  process.exit(1);
}

const db = initDb(DB_PATH);
const alertConfig = loadAlertConfig(process.env);
initAlerts(db);

const runAlerts = () => {
  runAlertEvaluation(db, alertConfig).catch((err) => {
    console.error("[alerts] evaluation failed:", err);
  });
};

const app = express();

app.use(express.json({ limit: "1mb" }));

app.use(
  "/api",
  createApiRouter(db, {
    ingestToken: INGEST_TOKEN,
    offlineThresholdMs: OFFLINE_THRESHOLD_MS,
    agentHttpPort: AGENT_HTTP_PORT,
    afterIngest: runAlerts,
    listAlerts: () => {
      const alerts = listActiveAlertsPublic(db);
      return { alerts, count: alerts.length };
    },
  }),
);

const webDist = path.join(__dirname, "..", "web", "dist");
app.use(express.static(webDist));

app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) {
    next();
    return;
  }
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) next();
  });
});

setInterval(runAlerts, 60_000);
runAlerts();

app.listen(PORT, HOST, () => {
  console.log(`FoldOps supervisor listening on http://${HOST}:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
  if (alertConfig.enabled) {
    console.log(
      `[alerts] enabled (webhook: ${alertConfig.webhookUrl ? "yes" : "console only"})`,
    );
  }
});
