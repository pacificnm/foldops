# FoldOps Agent

Collects system, FAH, and maintenance metrics every 60 seconds and POSTs them to the supervisor.

Runs on each FAH worker node (`fah-01` through `fah-04`).

## Prerequisites

- Node.js 22+ (see repo `.nvmrc`)
- `fah-client` installed and running
- Read access to `/var/lib/fah-client/client.db` (production service runs as **root**)

## Install dependencies

From the **repository root** (recommended — agent uses the `@foldops/shared` workspace package):

```bash
cd /path/to/foldops
npm install
```

Or from this directory only (still resolves workspace deps when run via `-w` from root):

```bash
npm install -w @foldops/agent
```

## Lint and typecheck

```bash
npm run typecheck -w @foldops/agent
npm run lint -w @foldops/agent
```

From the repo root, `npm run check` runs typecheck and lint for all packages.

## Build

The agent depends on `@foldops/shared`. Build shared types first, then the agent:

```bash
# From repository root
npm run build -w @foldops/shared
npm run build -w @foldops/agent
```

Or use the root shortcut:

```bash
npm run build:agent
```

Output is compiled to `apps/agent/dist/`.

## Development

```bash
cp apps/agent/.env.example apps/agent/.env
```

Edit `.env`:

- `SUPERVISOR_URL` — supervisor base URL (e.g. `http://fah-01:3000`)
- `AGENT_TOKEN` — must match supervisor `INGEST_TOKEN`

Run with hot reload:

```bash
npm run dev -w @foldops/agent
```

For local testing against a dev supervisor on the same machine:

```env
SUPERVISOR_URL=http://localhost:3000
AGENT_TOKEN=<same as INGEST_TOKEN in apps/supervisor/.env>
```

Reading `client.db` requires permission. If you see `permission denied` warnings, run as root:

```bash
sudo npm run dev -w @foldops/agent
```

## Production

### Build on the node (or build elsewhere and copy `dist/`)

```bash
cd /opt/foldops
npm install
npm run build -w @foldops/shared
npm run build -w @foldops/agent
```

### Run manually

```bash
set -a && source /etc/foldops/agent.env && set +a
node /opt/foldops/apps/agent/dist/index.js
```

### Run with systemd (recommended)

```bash
sudo cp /opt/foldops/apps/agent/systemd/foldops-agent.service /etc/systemd/system/
sudo cp apps/agent/.env.example /etc/foldops/agent.env   # then edit
sudo systemctl daemon-reload
sudo systemctl enable --now foldops-agent
sudo journalctl -u foldops-agent -f
```

See [docs/installation.md](../../docs/installation.md) for full farm deployment steps.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SUPERVISOR_URL` | — | Supervisor URL (required) |
| `AGENT_TOKEN` | — | Bearer token (required) |
| `INTERVAL_MS` | `60000` | Report interval |
| `FAH_LOG_PATH` | `/var/log/fah-client/log.txt` | FAH client log |
| `FAH_DB_PATH` | `/var/lib/fah-client/client.db` | FAH v8 SQLite DB |
| `FAH_WORK_DIR` | `/var/lib/fah-client/work` | FAH work units (progress fallback) |

## Verify

After start, logs should show:

```text
ingest OK (progress: 12.3%, PPD: 34865)
```

Not `progress: n/a, PPD: n/a` — that usually means `client.db` is not readable.

## More documentation

- [docs/agent.md](../../docs/agent.md) — metrics collected, FAH log/DB parsing
- [docs/configuration.md](../../docs/configuration.md) — `/etc/foldops/agent.env`
