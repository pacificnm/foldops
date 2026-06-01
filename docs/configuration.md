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
| `DB_PATH` | `./data/foldops.db` | No | SQLite database file path |
| `INGEST_TOKEN` | — | **Yes** | Bearer token agents must send on ingest |
| `OFFLINE_THRESHOLD_MS` | `120000` | No | Milliseconds after `last_seen` before marking offline |

### Example (production)

```env
PORT=3000
DB_PATH=/var/lib/foldops/foldops.db
INGEST_TOKEN=a1b2c3d4e5f6...
OFFLINE_THRESHOLD_MS=120000
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

### Example (production)

```env
SUPERVISOR_URL=http://fah-01:3000
AGENT_TOKEN=a1b2c3d4e5f6...
INTERVAL_MS=60000
FAH_LOG_PATH=/var/log/fah-client/log.txt
```

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
sudo chmod 600 /etc/foldops/*.env
```
