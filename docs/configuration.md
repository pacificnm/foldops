# Configuration

FoldOps uses environment variables loaded via `dotenv` in development and systemd `EnvironmentFile` in production.

## Secrets

Generate a long random token and use it for both:

- Supervisor: `INGEST_TOKEN`
- Every agent: `AGENT_TOKEN`

Example:

```bash
openssl rand -hex 32
```

Never commit `.env` files or `/etc/foldops/*.env` to version control.

---

## Supervisor

**Development:** `apps/supervisor/.env`  
**Production:** `/etc/foldops/supervisor.env`

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | `3000` | No | HTTP listen port |
| `HOST` | `0.0.0.0` | No | Bind address (`0.0.0.0` = all interfaces; required for remote agents) |
| `DB_PATH` | `./data/foldops.db` | No | SQLite database file path |
| `INGEST_TOKEN` | — | **Yes** | Bearer token agents must send on ingest |
| `OFFLINE_THRESHOLD_MS` | `120000` | No | Milliseconds after `last_seen` before marking offline |
| `ALERT_WEBHOOK_URL` | — | No | Discord (or Slack) incoming webhook URL |
| `ALERTS_ENABLED` | auto | No | Set `true` or `1` to enable evaluation; defaults on when `ALERT_WEBHOOK_URL` is set |
| `ALERT_DASHBOARD_URL` | — | No | Base URL for machine links in Discord embeds (e.g. `http://fah-01:3000`) |
| `ALERT_DISCORD_USERNAME` | `FoldOps` | No | Webhook display name in Discord |
| `CPU_TEMP_ALERT_C` | `85` | No | Fire a warning when CPU temperature (°C) is at or above this value |
| `ALERT_STUCK_HOURS` | `4` | No | Alert when FAH progress barely moves for this many hours (`0` = off) |
| `AGENT_HTTP_PORT` | `9100` | No | TCP port for live log pull from agents (`0` = cached logs only) |
| `DEPLOY_ENABLED` | off | No | Set `true` to enable `POST /api/deploy/agents` from the dashboard |
| `CONTROL_ENABLED` | off | No | Set `true` to enable remote control from the machine **Control** tab |

When alerts are enabled, the supervisor evaluates farm state every 60 seconds and after each agent ingest. Active issues are stored in SQLite and exposed at `GET /api/alerts` for the kiosk and dashboard banners.

**Alert rules (v1):**

- Node offline (no heartbeat within `OFFLINE_THRESHOLD_MS`)
- Node back online (recovery notification; not shown in the active banner)
- CPU temperature at or above `CPU_TEMP_ALERT_C`
- FAH client not active (`fah_status` ≠ `active`)
- FAH client service failed
- Recent FAH log errors in the agent payload
- FAH progress unchanged for `ALERT_STUCK_HOURS` while `fah-client` is active (compares ingest snapshots)

Discord receives **rich embeds** (one message per event). Slack and other hooks get plain text. Test with `POST /api/alerts/test`. See [alerts.md](alerts.md). Without a webhook URL, events are logged to the supervisor journal only.

### Example (production)

```env
PORT=3000
HOST=0.0.0.0
DB_PATH=/var/lib/foldops/foldops.db
INGEST_TOKEN=a1b2c3d4e5f6...
OFFLINE_THRESHOLD_MS=120000
ALERT_WEBHOOK_URL=https://discord.com/api/webhooks/...
CPU_TEMP_ALERT_C=85
```

---

## Agent

**Development:** `apps/agent/.env`  
**Production:** `/etc/foldops/agent.env`

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `SUPERVISOR_URL` | — | **Yes** | Base URL of the supervisor (no trailing slash) |
| `AGENT_TOKEN` | — | **Yes** | Bearer token (must match `INGEST_TOKEN`) |
| `INTERVAL_MS` | `60000` | No | Collection and POST interval in milliseconds |
| `FAH_LOG_PATH` | `/var/log/fah-client/log.txt` | No | Path to the FAH client log file |
| `FAH_DB_PATH` | `/var/lib/fah-client/client.db` | No | FAH v8 SQLite DB (progress, PPD, project) |
| `AGENT_HTTP_PORT` | `9100` | No | HTTP port for supervisor log pull (`0` to disable) |
| `UPDATE_ENABLED` | off | No | Allow supervisor to run `scripts/update-agent.sh` via `POST /update` |
| `FOLDOPS_ROOT` | `/opt/foldops` | No | Git checkout root on the node |
| `UPDATE_SCRIPT` | `$FOLDOPS_ROOT/scripts/update-agent.sh` | No | Update script path |
| `CONTROLS_ENABLED` | off | No | Allow `POST /control` (start/stop/restart agent & FAH, pause/resume) |
| `CONTROLS_ALLOW_REBOOT` | off | No | Allow `host.reboot` action |
| `FAH_DONOR_ID` | — | No | Donor name or ID for [stats.foldingathome.org](https://stats.foldingathome.org) links in the UI |
| `FAH_TEAM_NUMBER` | — | No | Team number for team stats links in the UI |

### Example (production)

```env
SUPERVISOR_URL=http://fah-01:3000
AGENT_TOKEN=a1b2c3d4e5f6...
INTERVAL_MS=60000
FAH_LOG_PATH=/var/log/fah-client/log.txt
AGENT_HTTP_PORT=9100
```

Agents expose `GET /logs/fah` and `GET /logs/work` (Bearer `AGENT_TOKEN`) for on-demand log viewing. The supervisor proxies these at `GET /api/machines/:hostname/logs`. Each ingest also caches the last 100 lines per log for offline viewing.

The supervisor must resolve each agent **hostname** (e.g. `fah-02`) to a LAN IP when pulling logs or deploying. Ingest uses `SUPERVISOR_URL` by IP and does not need this. After DHCP changes, update `/etc/hosts` on the supervisor (see [installation.md](installation.md#network-connectivity)). Ensure TCP `AGENT_HTTP_PORT` (default 9100) is reachable from the supervisor to each agent.

---

## Systemd paths

| File | Purpose |
|------|---------|
| `/etc/foldops/supervisor.env` | Supervisor configuration |
| `/etc/foldops/agent.env` | Agent configuration |
| `/var/lib/foldops/foldops.db` | Production SQLite database |
| `/opt/foldops` | Deployed application root |

Set permissions on env files:

```bash
chmod 600 /etc/foldops/*.env
```
