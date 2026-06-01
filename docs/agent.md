# Agent

The FoldOps agent (`apps/agent`) runs on each FAH worker node and reports a full system + FAH snapshot every 60 seconds.

## What it collects

### Host identity

| Field | Source |
|-------|--------|
| `hostname` | `os.hostname()` |
| `timestamp` | Current time (ISO 8601) |

### System metrics

| Field | Source |
|-------|--------|
| `uptime` | `os.uptime()` (seconds) |
| `loadAvg` | `os.loadavg()` — 1, 5, 15 minute averages |
| `cpuUsage` | `systeminformation` current load (%) |
| `memory` | Total, used, free bytes and percent |
| `disk` | Root filesystem (`/`) size, used, free, percent |
| `network` | Primary non-loopback interface bytes and per-second rates |
| `cpuTemp` | `systeminformation` CPU temperature (°C), or null |

### FAH client

| Field | Source |
|-------|--------|
| `systemdStatus` | `systemctl is-active fah-client` |
| `project`, `run`, `clone`, `gen` | Parsed from FAH log |
| `progress` | Parsed from FAH log (%) |
| `ppd` | Parsed from FAH log |
| `tpf` | Parsed from FAH log (time per fold) |
| `recentErrors` | Last 10 log lines matching error patterns |

### Maintenance

| Field | Source |
|-------|--------|
| `aptUpdatesAvailable` | Count from `apt list --upgradable` |
| `rebootRequired` | Existence of `/var/run/reboot-required` |

---

## FAH log parsing

The agent reads the tail of the FAH client log (default: `/var/log/fah-client/log.txt`, last 500 lines) and extracts:

| Pattern | Example log line |
|---------|------------------|
| Project / run / clone / gen | `Project: 11742 (Run 0, Clone 128, Gen 45)` |
| Progress | `Progress: 67.50%` |
| PPD | `PPD: 125,000.00` |
| TPF | `TPF: 0:35:12` |
| Errors | Lines containing `ERROR`, `FATAL`, `Exception`, or `failed` |

If the log file is missing or unreadable, FAH fields default to null/empty without failing the collection cycle.

---

## Payload schema

Defined in `packages/shared/src/schema.ts` and validated by the supervisor on ingest.

```typescript
{
  hostname: string;
  timestamp: string;          // ISO 8601 datetime
  system: {
    uptime: number;
    loadAvg: [number, number, number];
    cpuUsage: number;
    memory: { total, used, free, percent };
    disk: { total, used, free, percent };
    network: { rxBytes, txBytes, rxSec, txSec };
    cpuTemp: number | null;
  };
  fah: {
    systemdStatus: "active" | "inactive" | "failed" | "unknown";
    project: string | null;
    run: number | null;
    clone: number | null;
    gen: number | null;
    progress: number | null;
    ppd: number | null;
    tpf: string | null;
    recentErrors: string[];
  };
  maintenance: {
    aptUpdatesAvailable: number;
    rebootRequired: boolean;
  };
}
```

---

## Why root?

The production systemd unit runs the agent as **root** because it needs to:

- Read `/var/log/fah-client/log.txt`
- Run `systemctl is-active fah-client`
- Run `apt list --upgradable`
- Check `/var/run/reboot-required`

---

## Service management

```bash
# Status
sudo systemctl status foldops-agent

# Logs
sudo journalctl -u foldops-agent -f

# Restart
sudo systemctl restart foldops-agent
```

Unit file: `apps/agent/systemd/foldops-agent.service`
