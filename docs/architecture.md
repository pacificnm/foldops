# Architecture

## Overview

FoldOps uses a hub-and-spoke model: one **supervisor** aggregates data from multiple **agents**, each running on a Folding@home worker node.

```
                    ┌─────────────────────────────────┐
                    │  fah-01 (supervisor)            │
                    │  Express + SQLite + React UI    │
                    │  :3000                          │
                    └──────────────▲──────────────────┘
                                   │
                    POST /api/ingest (Bearer token, every 60s)
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
    ┌────┴────┐              ┌─────┴────┐             ┌──────┴───┐
    │ fah-01  │              │ fah-02   │     ...     │ fah-04   │
    │ agent   │              │ agent    │             │ agent    │
    └─────────┘              └──────────┘             └──────────┘
```

## Components

| Component | Package | Host | Role |
|-----------|---------|------|------|
| Supervisor | `apps/supervisor` | `fah-01` | Ingest API, SQLite storage, serves React dashboard |
| Agent | `apps/agent` | `fah-01`..`fah-04` | Collect local metrics, POST to supervisor |
| Shared schemas | `packages/shared` | — | Zod validation for ingest payloads |

## Data flow

1. **Agent** wakes on a 60-second interval (`INTERVAL_MS`).
2. Agent collects system stats (`systeminformation`), FAH client state (systemd + log parse), and maintenance flags.
3. Agent POSTs a JSON payload to `SUPERVISOR_URL/api/ingest` with `Authorization: Bearer <token>`.
4. **Supervisor** validates the payload with Zod, upserts the machine record, and inserts a snapshot row.
5. **Dashboard** polls `GET /api/machines` every 30 seconds and renders machine cards.

## Online / offline detection

A machine is considered **online** when `last_seen` (updated on each successful ingest) is within `OFFLINE_THRESHOLD_MS` (default: 120000 ms = 2 minutes).

Farm total PPD sums `ppd` from all **online** machines that have a non-null PPD in their latest snapshot.

## Tech stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 22 |
| Agent / API | TypeScript, Express 5 |
| Database | SQLite via `better-sqlite3` |
| Validation | Zod (`packages/shared`) |
| System metrics | `systeminformation` |
| Frontend | React 19, Vite 6 |
| Config | `dotenv` |

## Security model

- Agents authenticate to the ingest endpoint with a shared bearer token (`AGENT_TOKEN` / `INGEST_TOKEN`).
- Read API endpoints (`/api/machines`, etc.) are unauthenticated — intended for a trusted LAN.
- Agent runs as **root** in production to read FAH logs, query systemd, and check apt/reboot status.
- Supervisor runs as a dedicated **`foldops`** system user with access only to its data directory.

## Systemd services

| Service | Unit file | Host |
|---------|-----------|------|
| `foldops-supervisor` | `apps/supervisor/systemd/foldops-supervisor.service` | fah-01 |
| `foldops-agent` | `apps/agent/systemd/foldops-agent.service` | fah-01..fah-04 |

Environment files live at `/etc/foldops/supervisor.env` and `/etc/foldops/agent.env`.
