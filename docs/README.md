# FoldOps Documentation

FoldOps is a Folding@home farm monitor for Debian nodes. Agents on each FAH machine report metrics every 60 seconds to a central supervisor, which stores snapshots in SQLite and serves a React dashboard.

## Contents

| Document | Description |
|----------|-------------|
| [Architecture](architecture.md) | System design, components, and data flow |
| [Installation](installation.md) | Development setup, **apt install** (`deb.folding-os.com`), and legacy git deployment |
| [Configuration](configuration.md) | Environment variables and secrets |
| [API Reference](api.md) | HTTP endpoints and response formats |
| [Agent](agent.md) | Metrics, build, and FAH log/DB parsing |
| [apps/agent/README.md](../apps/agent/README.md) | Agent build, dev, and systemd quick reference |
| [Database](database.md) | SQLite schema and retention |
| [Roadmap](roadmap.md) | Future feature ideas backlog |
| [Rust migration](rust-migration.md) | Plan to rewrite agent/supervisor in Rust for Folding-OS images |
| [Folding-OS integration](folding-os.md) | Binary paths, systemd, and Buildroot packaging |
| [packaging/folding-os/README.md](../packaging/folding-os/README.md) | Reference Buildroot packages for folding-os maintainers |
| [packaging/deb/README.md](../packaging/deb/README.md) | Official apt repo (`deb.folding-os.com`), signing, and publish workflow |
| [Alerts & Discord](alerts.md) | Webhook setup, rules, and troubleshooting |

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

**Farm nodes (production):** Debian with `fah-client`, outbound HTTPS to `deb.folding-os.com`, and FoldOps packages from apt — see [Installation — apt](installation.md#production-deployment-apt). No Node.js or git checkout on the node.

**Development / legacy git farms:**

- Node.js 22+
- Build tools for `better-sqlite3` on the supervisor host (`build-essential`, `python3`)
- **Optional:** `lm-sensors` on agent hosts if chassis temperature is not exposed via hwmon alone (see [Installation](installation.md#temperature-sensors-optional))
- **Rust migration:** `rustup` + native dev packages on build hosts only — run `./scripts/check-rust-prereqs.sh` or see [Installation — Rust development prerequisites](installation.md#rust-development-prerequisites)

## Project layout

```
foldops/
├── Cargo.toml              # Rust workspace (agent + supervisor + types)
├── crates/
│   ├── foldops-types/      # Shared ingest/control types
│   ├── foldops-agent/      # Rust agent (in progress)
│   └── foldops-supervisor/ # Rust supervisor (in progress)
├── apps/
│   ├── agent/              # Legacy Node metrics collector
│   └── supervisor/         # Legacy Node API + React dashboard
│       └── web/            # Vite + React frontend
├── packages/
│   └── shared/             # Shared Zod schemas (Node)
├── systemd/rust/           # Systemd units for Rust binaries
└── docs/                   # This documentation
```
