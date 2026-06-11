# API Reference

Base URL: `http://fah-01:3000` (production) or `http://localhost:3000` (development).

All API routes are prefixed with `/api`.

## Authentication

Only `POST /api/ingest` requires authentication:

```
Authorization: Bearer <INGEST_TOKEN>
```

Read endpoints are unauthenticated.

---

## POST /api/ingest

Store a snapshot from an agent.

**Auth:** Bearer token required.

**Request body:** JSON matching the [ingest payload schema](agent.md#payload-schema).

**Responses:**

| Status | Body | Meaning |
|--------|------|---------|
| `200` | `{ "ok": true, "hostname": "fah-02" }` | Snapshot stored |
| `400` | `{ "error": "Invalid payload", "details": {...} }` | Zod validation failed |
| `401` | `{ "error": "Missing bearer token" }` | No Authorization header |
| `403` | `{ "error": "Invalid token" }` | Token mismatch |
| `500` | `{ "error": "Failed to store snapshot" }` | Database error |

---

## GET /api/machines

List all known machines with their latest snapshot and farm aggregate.

**Auth:** None.

**Response:**

```json
{
  "machines": [
    {
      "hostname": "fah-01",
      "first_seen": "2026-06-01T10:00:00.000Z",
      "last_seen": "2026-06-01T12:05:00.000Z",
      "online": true,
      "latest": {
        "id": 42,
        "created_at": "2026-06-01T12:05:00.000Z",
        "fah_status": "active",
        "project": "11742",
        "run": 0,
        "clone": 128,
        "gen": 45,
        "progress": 67.5,
        "ppd": 125000,
        "cpu_usage": 45.5,
        "memory_percent": 50,
        "disk_percent": 40,
        "cpu_temp": 61.3,
        "chassis_temp": 59.0,
        "apt_updates": 3,
        "reboot_required": false,
        "payload": { }
      }
    }
  ],
  "farm_ppd": 500000
}
```

- `online` — `true` when `last_seen` is within `OFFLINE_THRESHOLD_MS`.
- `farm_ppd` — sum of `ppd` from online machines with a non-null latest PPD.
- `latest` — `null` if no snapshots exist for the machine.
- `latest.cpu_temp` / `latest.chassis_temp` — temperatures in °C, or `null` if no sensor was found. Also available in `latest.payload.system.cpuTemp` and `latest.payload.system.chassisTemp`.

---

## GET /api/machines/:name

Get a single machine by hostname.

**Auth:** None.

**Response:** Same shape as one element of `machines` in the list endpoint (without `farm_ppd`).

```json
{
  "hostname": "fah-01",
  "first_seen": "2026-06-01T10:00:00.000Z",
  "last_seen": "2026-06-01T12:05:00.000Z",
  "online": true,
  "latest": { }
}
```

**Errors:**

| Status | Body |
|--------|------|
| `404` | `{ "error": "Machine not found" }` |

---

## GET /api/alerts/history

List alert records (active and resolved) from SQLite.

**Auth:** None.

**Query parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `status` | `all` | `all`, `active`, or `resolved` |
| `limit` | `100` | Max rows (cap 500) |
| `hostname` | — | Filter to one machine |

**Response:**

```json
{
  "alerts": [
    {
      "id": "fah-02:cpu_temp_high",
      "hostname": "fah-02",
      "kind": "cpu_temp_high",
      "severity": "warning",
      "message": "fah-02 CPU temperature 87.0°C (≥ 85°C)",
      "active": true,
      "fired_at": "2026-06-03T10:00:00.000Z",
      "resolved_at": null,
      "duration_ms": 3600000,
      "details": null
    }
  ],
  "count": 1,
  "counts": { "active": 2, "resolved": 15, "total": 17 },
  "status": "all"
}
```

`GET /api/alerts` still returns **active** alerts only (for kiosk/dashboard banners).

---

## GET /api/alerts/status

Whether alerts are enabled, webhook is configured, Discord detection, and last webhook error/success time.

---

## POST /api/alerts/test

Send a test notification to `ALERT_WEBHOOK_URL`. Requires alerts enabled and webhook URL set.

**Response:** `{ "ok": true, "message": "Test notification sent", "status": { ... } }`

See [alerts.md](alerts.md) for Discord setup.

---

## GET /api/projects/:id

Fetch public project metadata from [Folding@home’s API](https://api.foldingathome.org/project/:id). The supervisor proxies and caches responses for one hour (HTML descriptions are converted to plain text; large image fields are omitted).

**Auth:** None.

**Response:**

```json
{
  "project": 18490,
  "manager": "Prof. Vincent Voelz",
  "cause": "cancer",
  "institution": "Temple University",
  "description": "…plain text summary…",
  "projectRange": "18490-18495",
  "modified": "2023-08-25 15:03:14",
  "statsUrl": "https://stats.foldingathome.org/project/18490"
}
```

**Errors:**

| Status | Body |
|--------|------|
| `400` | `{ "error": "Invalid project id" }` |
| `404` | `{ "error": "Project not found" }` |
| `502` | `{ "error": "Failed to fetch project from Folding@home" }` |

---

## GET /api/snapshots/:name

Get snapshot history for a machine.

**Auth:** None.

**Query parameters:**

| Parameter | Default | Max | Description |
|-----------|---------|-----|-------------|
| `limit` | `100` | `500` | Number of snapshots to return |

**Response:**

```json
{
  "hostname": "fah-01",
  "snapshots": [
    {
      "id": 42,
      "created_at": "2026-06-01T12:05:00.000Z",
      "summary": {
        "fah_status": "active",
        "project": "11742",
        "progress": 67.5,
        "ppd": 125000,
        "cpu_usage": 45.5,
        "memory_percent": 50
      },
      "payload": { }
    }
  ]
}
```

Snapshots are ordered newest first.

**Errors:**

| Status | Body |
|--------|------|
| `404` | `{ "error": "Machine not found" }` |

---

## GET /api/deploy/runs

List recent agent deploy runs (newest first).

**Auth:** None (trusted LAN; requires `DEPLOY_ENABLED=true` to start runs).

**Response:**

```json
{
  "runs": [
    {
      "id": "uuid",
      "created_at": "2026-06-01T12:00:00.000Z",
      "status": "completed",
      "hostnames": ["fah-02", "fah-03"],
      "results": { }
    }
  ]
}
```

---

## GET /api/deploy/runs/:id

Get one deploy run with per-host results and log output.

---

## POST /api/deploy/agents

Push an agent update to farm nodes (`git pull`, `npm install`, `build:agent`, restart `foldops-agent`).

**Auth:** None (enable with `DEPLOY_ENABLED=true` on the supervisor).

**Request body (optional):**

```json
{
  "hostnames": ["fah-02", "fah-03"]
}
```

Omit `hostnames` to update all known machines.

**Response:** `202` with `{ "run_id": "uuid", "status": "running" }`. Poll `GET /api/deploy/runs/:id` for progress.

**Requirements:** Each target must be online, reachable on `AGENT_HTTP_PORT`, and have `UPDATE_ENABLED=true` with a git checkout at `FOLDOPS_ROOT` (default `/opt/foldops`).

**Folding-OS appliances:** nodes built from [Folding-OS images](folding-os.md) have no git/npm checkout. This endpoint is for legacy Debian dev farms only; appliance updates use the OS update system (Folding-OS Milestone 4).

---

## Static frontend

In production, the supervisor serves the built React app from `apps/supervisor/web/dist`. Non-API GET requests receive `index.html` for client-side routing.
