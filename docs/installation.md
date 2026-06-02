# Installation

## Development

### Prerequisites

- Node.js 22+ (see `.nvmrc`)
- npm 10+

### Setup

```bash
git clone <repo-url> foldops
cd foldops
npm install
```

### Build shared types

```bash
npm run build -w @foldops/shared
```

### Run the supervisor

```bash
cp apps/supervisor/.env.example apps/supervisor/.env
# Edit INGEST_TOKEN in apps/supervisor/.env

npm run dev -w @foldops/supervisor
```

Supervisor listens on `http://localhost:3000` by default.

### Run the dashboard (dev)

In a separate terminal:

```bash
cd apps/supervisor/web
npm install
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` requests to the supervisor on port 3000.

### Build and run an agent

Build (shared package must be built first):

```bash
npm run build -w @foldops/shared
npm run build -w @foldops/agent
# or: npm run build:agent
```

Configure and run in dev mode (TypeScript via `tsx`, no `dist/` required):

```bash
cp apps/agent/.env.example apps/agent/.env
# Set SUPERVISOR_URL=http://localhost:3000
# Set AGENT_TOKEN to the same value as INGEST_TOKEN

npm run dev -w @foldops/agent
```

Production-style run from compiled output:

```bash
npm run build:agent
set -a && source apps/agent/.env && set +a
npm run start -w @foldops/agent
```

See also [apps/agent/README.md](../apps/agent/README.md).

---

## Production build

From the repository root:

```bash
npm install
```

Run from the **repository root** (`/opt/foldops`), not from `apps/supervisor/web`.

If `NODE_ENV=production` is set globally, install with dev deps for the build step:

```bash
npm install --include=dev
# or: NODE_ENV=development npm install
```

**Supervisor** (fah-01 only — includes React dashboard):

```bash
npm run build:supervisor
# builds shared → supervisor API → React dashboard (vite)
```

**Agent** (every FAH node):

```bash
npm run build:agent
# equivalent to:
# npm run build -w @foldops/shared && npm run build -w @foldops/agent
```

**Everything:**

```bash
npm run build
```

| Command | Output |
|---------|--------|
| `build:agent` | `apps/agent/dist/` |
| `build:supervisor` | `apps/supervisor/dist/` + `apps/supervisor/web/dist/` |

---

## Production deployment

### 1. Deploy code to supervisor (fah-01)

```bash
sudo mkdir -p /opt/foldops
sudo rsync -av --exclude node_modules --exclude .env ./ /opt/foldops/
cd /opt/foldops
sudo npm install --include=dev
sudo npm run build:supervisor
```

Or use the helper script: `sudo ./scripts/build-supervisor.sh`

### 1b. Deploy code to each agent host (fah-01..fah-04)

Same tree on every node (or rsync only `apps/agent`, `packages/shared`, and root `package.json` / lockfile):

```bash
sudo mkdir -p /opt/foldops
sudo rsync -av --exclude node_modules --exclude .env ./ /opt/foldops/
cd /opt/foldops
sudo npm install
sudo npm run build:agent
```

### 2. Supervisor on fah-01

Create the service user and data directory:

```bash
sudo useradd --system --home /opt/foldops --shell /usr/sbin/nologin foldops || true
sudo mkdir -p /etc/foldops /var/lib/foldops
sudo chown foldops:foldops /var/lib/foldops
```

Create the environment file:

```bash
sudo tee /etc/foldops/supervisor.env << 'EOF'
PORT=3000
DB_PATH=/var/lib/foldops/foldops.db
INGEST_TOKEN=your-long-random-secret-here
OFFLINE_THRESHOLD_MS=120000
EOF
sudo chmod 600 /etc/foldops/supervisor.env
```

Install and start the systemd unit:

```bash
sudo cp /opt/foldops/apps/supervisor/systemd/foldops-supervisor.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now foldops-supervisor
```

Verify:

```bash
sudo systemctl status foldops-supervisor
curl -s http://localhost:3000/api/machines
```

Dashboard: **http://fah-01:3000**

### 3. Agent on fah-01 through fah-04

On each FAH node, create the agent environment file. Use the **same** secret as `INGEST_TOKEN` on the supervisor:

```bash
sudo tee /etc/foldops/agent.env << 'EOF'
SUPERVISOR_URL=http://fah-01:3000
AGENT_TOKEN=your-long-random-secret-here
INTERVAL_MS=60000
FAH_LOG_PATH=/var/log/fah-client/log.txt
EOF
sudo chmod 600 /etc/foldops/agent.env
```

Install and start the agent:

```bash
sudo cp /opt/foldops/apps/agent/systemd/foldops-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now foldops-agent
```

Verify:

```bash
sudo systemctl status foldops-agent
sudo journalctl -u foldops-agent -f
```

After ~60 seconds, the machine should appear on the dashboard.

### Native module build (supervisor only)

`better-sqlite3` requires native compilation. On Debian:

```bash
sudo apt install build-essential python3
```

Run `npm install` on the supervisor host after installing these packages.

### Temperature sensors (optional)

CPU temperature is usually available via kernel hwmon (`coretemp`, `k10temp`, etc.) without extra packages. **Chassis** temperature depends on the motherboard reporting a system/board sensor—often labeled `SYST` or exposed through `acpitz`.

If the dashboard shows `—` for chassis temp on a node:

```bash
# See what the kernel exposes
grep -H . /sys/class/hwmon/hwmon*/temp*_label 2>/dev/null
```

Install **lm-sensors** for additional chips and the `sensors` CLI:

```bash
sudo apt install lm-sensors
sudo sensors-detect   # interactive, run once per machine
sensors               # verify readings
```

No agent configuration is required—the agent picks up hwmon and `sensors -j` automatically. Restart the agent after installing sensors:

```bash
sudo systemctl restart foldops-agent
```

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Agent logs `ingest error` | `AGENT_TOKEN` matches `INGEST_TOKEN`; supervisor reachable at `SUPERVISOR_URL` |
| Machine shows offline | Agent service running; firewall allows port 3000 to fah-01 |
| No FAH metrics | `fah-client` running; agent can read `FAH_DB_PATH` and `FAH_LOG_PATH` |
| Progress/PPD show `—` | Redeploy agent (Node 22+); confirm `FAH_DB_PATH` exists and is readable; check `journalctl -u foldops-agent` for warnings |
| Supervisor won't start | `INGEST_TOKEN` set; `DB_PATH` directory writable by `foldops` user |
| Build fails on sqlite | Install `build-essential` and `python3`, re-run `npm install` |
| CPU temp shows `—` | Check hwmon: `ls /sys/class/hwmon/`; verify `coretemp` or platform driver loaded |
| Chassis temp shows `—` | Motherboard may lack a chassis sensor; try `lm-sensors` (see [Temperature sensors](#temperature-sensors-optional)) |
