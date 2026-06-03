# Alerts & Discord

FoldOps evaluates the farm every **60 seconds** and after each agent ingest. When rules fire or clear, notifications go to the dashboard/kiosk banner, SQLite history, and an optional webhook.

## Discord setup

1. In Discord: **Server Settings → Integrations → Webhooks → New Webhook**
2. Pick a channel (e.g. `#folding-alerts`), copy the webhook URL.
3. On the supervisor (`/etc/foldops/supervisor.env`):

```env
ALERTS_ENABLED=true
ALERT_WEBHOOK_URL=https://discord.com/api/webhooks/ID/TOKEN
ALERT_DASHBOARD_URL=http://192.168.4.10:3000
ALERT_DISCORD_USERNAME=FoldOps
CPU_TEMP_ALERT_C=85
```

`ALERT_DASHBOARD_URL` adds a clickable link on each embed to the machine page (`/machine/:hostname`).

4. Restart supervisor:

```bash
systemctl restart foldops-supervisor
```

5. Send a test message:

```bash
curl -X POST http://127.0.0.1:3000/api/alerts/test
```

Or use **Alert history** in the dashboard (Test webhook button).

## Notification format

Discord webhooks receive **one embed per event** (separate mobile notifications):

| Event | Embed |
|-------|--------|
| New alert | Colored by severity (red / yellow / green), host, type, message, optional error details |
| Resolved | Green “Resolved” with original message |
| Node back online | Blue “Node back online” |

Non-Discord URLs (e.g. Slack) still get a plain-text batch message.

## Rules

| Rule | Severity |
|------|----------|
| No heartbeat within `OFFLINE_THRESHOLD_MS` | critical |
| Node back online | info (history + Discord, not active banner) |
| CPU ≥ `CPU_TEMP_ALERT_C` | warning |
| `fah-client` not active | warning |
| `fah-client` failed | critical |
| Recent FAH log errors | warning (re-fires if errors change) |
| FAH progress stuck | warning (`ALERT_STUCK_HOURS`, default 4h; set `0` to disable) |

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/alerts` | Active alerts (banner) |
| `GET /api/alerts/history` | Active + resolved history |
| `GET /api/alerts/status` | Enabled, webhook configured, last error/success |
| `POST /api/alerts/test` | Send a test Discord/embed message |

## Troubleshooting

| Issue | Check |
|-------|--------|
| No Discord messages | `ALERT_WEBHOOK_URL` set; `curl -X POST .../api/alerts/test`; `journalctl -u foldops-supervisor \| grep alerts` |
| `401` / `404` from Discord | Webhook was deleted or URL copied wrong — create a new webhook |
| Alerts in UI but not Discord | `GET /api/alerts/status` → `last_error`; fix URL and retry test |
| Too many messages | Each fire/resolve is one message; tune rules or thresholds |

Without `ALERT_WEBHOOK_URL`, alerts still run and appear in the UI; events are logged to the supervisor journal only.
