# Database

The supervisor stores all data in a single SQLite database (default: `/var/lib/foldops/foldops.db` in production).

- **Engine:** SQLite with WAL journal mode
- **Driver:** `better-sqlite3`

## Schema

### `machines`

Tracks each agent host that has reported at least once.

| Column | Type | Description |
|--------|------|-------------|
| `hostname` | TEXT PK | Machine hostname from agent |
| `first_seen` | TEXT | ISO timestamp of first ingest |
| `last_seen` | TEXT | ISO timestamp of most recent ingest |

Updated on every successful ingest: `last_seen` is set to the payload timestamp; `first_seen` is set only on insert.

### `snapshots`

One row per ingest. Stores the full JSON payload plus indexed summary columns for fast queries.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `hostname` | TEXT FK | References `machines.hostname` |
| `created_at` | TEXT | Payload timestamp |
| `payload` | TEXT | Full JSON snapshot |
| `fah_status` | TEXT | `fah.systemdStatus` |
| `project` | TEXT | FAH project number |
| `run` | INTEGER | FAH run |
| `clone` | INTEGER | FAH clone |
| `gen` | INTEGER | FAH generation |
| `progress` | REAL | WU progress (%) |
| `ppd` | REAL | Points per day |
| `cpu_usage` | REAL | CPU usage (%) |
| `memory_percent` | REAL | Memory used (%) |
| `disk_percent` | REAL | Disk used (%) |
| `apt_updates` | INTEGER | Available apt upgrades |
| `reboot_required` | INTEGER | 0 or 1 |

### Indexes

```sql
CREATE INDEX idx_snapshots_hostname_created
  ON snapshots(hostname, created_at DESC);
```

## Query patterns

| Endpoint | Query |
|----------|-------|
| List machines | `SELECT * FROM machines ORDER BY hostname` |
| Latest snapshot | `SELECT * FROM snapshots WHERE hostname = ? ORDER BY created_at DESC LIMIT 1` |
| History | `SELECT * FROM snapshots WHERE hostname = ? ORDER BY created_at DESC LIMIT ?` |

## Growth

With 4 agents reporting every 60 seconds:

- ~5,760 snapshots per machine per day
- ~23,040 rows per day total

SQLite handles this volume easily. For long-term retention, consider periodic pruning or archiving — a `pruneOldSnapshots` helper exists in `apps/supervisor/src/db.ts` but is not scheduled by default.

## Backup

```bash
# Online backup (WAL mode)
sqlite3 /var/lib/foldops/foldops.db ".backup /backup/foldops-$(date +%F).db"
```

Stop the supervisor for a consistent file copy, or use SQLite's `.backup` command while running.
