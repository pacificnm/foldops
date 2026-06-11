# FoldOps roadmap ideas

Backlog of possible features to revisit. Not committed work — pick items when they solve a real farm pain.

**Suggested next (from ops experience):**

1. Agent LAN IP in ingest (avoid `/etc/hosts` after DHCP changes)
2. Alert history + farm timeline
3. Kiosk apt/reboot prominence + stuck-WU detection

---

## High value, reasonable effort

| Idea | Why |
|------|-----|
| Agent IP in ingest | Store each node’s LAN IP on every snapshot so logs, deploy, and control don’t depend on `/etc/hosts` after DHCP changes. |
| ~~Alert history page~~ | **Done** — `/alerts` tab with filters and `/api/alerts/history`. |
| Farm timeline | One feed: offline, high temp, FAH failed, deploy run, control action. |
| Per-node thresholds | e.g. fah-03 alerts at 90°C, others at 85°C. |
| Prometheus `/metrics` | Single endpoint for Grafana — farm PPD, online count, temps. |
| CSV export | Snapshots or daily rollups for weekly reporting. |

---

## FAH / folding depth

| Idea | Why |
|------|-----|
| ~~Donor / team stats link~~ | Done — `FAH_DONOR_ID` / `FAH_TEAM_NUMBER` on agent; links on kiosk tile, machine card, detail header. |
| WU / slot detail | GPU vs CPU slots, slot state from `client.db` or WebSocket. |
| PPD leaderboard view | Sort nodes by current PPD; spot stuck or idle nodes. |
| ~~Stuck detection~~ | **Done** — `ALERT_STUCK_HOURS` (default 4h, `0` = off). |
| Pause / resume whole farm | One-click all-node pause/resume (extends Control tab). |

---

## Ops & production

| Idea | Why |
|------|-----|
| Maintenance mode | Mute alerts + banner during router/apt work. |
| Supervisor self-update | Deploy flow for `foldops-supervisor` on fah-01 only. |
| Audit log | Record deploy/control actions with timestamp in DB. |
| DB backup script / reminder | Nightly copy of `foldops.db`; snapshots are history. |
| apt / reboot on kiosk | Stronger badges for `apt_updates` and `reboot_required` on 7″ display. |

---

## Kiosk & UX

| Idea | Why |
|------|-----|
| Full-screen kiosk mode | Hide dashboard link; optional tile rotation for 5+ nodes. |
| Project cause on tile | One line from cached FAH project API. |
| Alert noise tuning | Webhook only for critical; banner for all. |
| Phone layout | Machine detail charts on narrow screens. |

---

## Deferred / larger

| Idea | Notes |
|------|--------|
| Web SSH terminal | Possible via xterm.js + ssh2 on supervisor; not needed for v1 — use `ssh root@host` or ttyd/Guacamole. |
| Multi-supervisor / remote site | Only if farm spans networks. |
| Auth on read API | If dashboard leaves trusted LAN. |
| Router DHCP integration | Usually `/etc/hosts` or stored IP is enough. |

---

## Already shipped (reference)

- Hub-and-spoke ingest, kiosk + dashboard, machine history charts
- FAH project info proxy
- Alerts v1 (webhook + banner)
- Log viewer (ingest cache + live pull on agent HTTP :9100)
- Deploy agents from supervisor (`git pull`, build, restart) — legacy git farms; apt farms use `deb.folding-os.com`
- Remote control tab (agent, FAH systemd, pause/resume/finish, optional reboot)

See [configuration.md](configuration.md), [installation.md](installation.md), and [api.md](api.md) for current behavior.
