# FoldOps Documentation

FoldOps is a Folding@home farm monitor for Debian nodes. Agents on each FAH machine report metrics every 60 seconds to a central supervisor, which stores snapshots in SQLite and serves a React dashboard.

## Contents

| Document | Description |
|----------|-------------|
| [Architecture](architecture.md) | System design, components, and data flow |
| [Installation](installation.md) | Development setup and production deployment |
| [Configuration](configuration.md) | Environment variables and secrets |
| [API Reference](api.md) | HTTP endpoints and response formats |
| [Agent](agent.md) | Metrics, build, and FAH log/DB parsing |
| [apps/agent/README.md](../apps/agent/README.md) | Agent build, dev, and systemd quick reference |
| [Database](database.md) | SQLite schema and retention |

## Quick links

- **Dashboard (production):** `http://fah-01:3000`
- **Supervisor host:** `fah-01`
- **Agent hosts:** `fah-01` through `fah-04`

## Metrics collected

Each agent reports every 60 seconds:

- **System:** uptime, load, CPU %, memory, disk, network, **CPU temperature**, **chassis temperature**
- **FAH:** service status, project/run/clone/gen, progress, PPD, TPF, recent log errors
- **Maintenance:** apt updates available, reboot required

The dashboard shows both temperatures on each machine card. See [Agent — Temperature collection](agent.md#temperature-collection) for sensor sources and troubleshooting.

## Requirements

- Node.js 22+
- Debian with `fah-client` systemd unit
- Build tools for `better-sqlite3` on the supervisor host (`build-essential`, `python3`)
- **Optional:** `lm-sensors` on agent hosts if chassis temperature is not exposed via hwmon alone (see [Installation](installation.md#temperature-sensors-optional))

## Project layout

```
foldops/
├── apps/
│   ├── agent/              # Metrics collector (fah-01..fah-04)
│   └── supervisor/         # API, SQLite, React dashboard (fah-01)
│       └── web/            # Vite + React frontend
├── packages/
│   └── shared/             # Shared Zod schemas
└── docs/                   # This documentation
```
