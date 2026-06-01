import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb } from "./db.js";
import { createApiRouter } from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? "3000");
const DB_PATH = process.env.DB_PATH ?? "./data/foldops.db";
const INGEST_TOKEN = process.env.INGEST_TOKEN;
const OFFLINE_THRESHOLD_MS = Number(process.env.OFFLINE_THRESHOLD_MS ?? "120000");

if (!INGEST_TOKEN) {
  console.error("INGEST_TOKEN is required");
  process.exit(1);
}

const db = initDb(DB_PATH);
const app = express();

app.use(express.json({ limit: "1mb" }));

app.use(
  "/api",
  createApiRouter(db, {
    ingestToken: INGEST_TOKEN,
    offlineThresholdMs: OFFLINE_THRESHOLD_MS,
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

app.listen(PORT, () => {
  console.log(`FoldOps supervisor listening on http://0.0.0.0:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});
