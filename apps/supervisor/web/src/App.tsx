import { useCallback, useEffect, useState } from "react";
import { fetchMachines } from "./api";
import type { MachineSummary, MachinesResponse } from "./types";

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatLastSeen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleString();
}

function formatPpd(ppd: number | null): string {
  if (ppd == null) return "—";
  if (ppd >= 1_000_000) return `${(ppd / 1_000_000).toFixed(2)}M`;
  if (ppd >= 1_000) return `${(ppd / 1_000).toFixed(1)}k`;
  return ppd.toFixed(0);
}

function MachineCard({ machine }: { machine: MachineSummary }) {
  const latest = machine.latest;
  const load = latest?.payload?.system.loadAvg;
  const uptime = latest?.payload?.system.uptime;
  const tpf = latest?.payload?.fah.tpf;
  const errors = latest?.payload?.fah.recentErrors ?? [];

  return (
    <article className={`card ${machine.online ? "online" : "offline"}`}>
      <header className="card-header">
        <h2>{machine.hostname}</h2>
        <span className={`badge ${machine.online ? "badge-ok" : "badge-warn"}`}>
          {machine.online ? "online" : "offline"}
        </span>
      </header>

      <div className="card-section">
        <h3>FAH</h3>
        <dl className="stats">
          <div>
            <dt>Service</dt>
            <dd className={`status-${latest?.fah_status ?? "unknown"}`}>
              {latest?.fah_status ?? "—"}
            </dd>
          </div>
          <div>
            <dt>Project</dt>
            <dd>
              {latest?.project
                ? `${latest.project} (R${latest.run ?? "?"}/C${latest.clone ?? "?"}/G${latest.gen ?? "?"})`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Progress</dt>
            <dd>
              {latest?.progress != null ? `${latest.progress.toFixed(1)}%` : "—"}
            </dd>
          </div>
          <div>
            <dt>PPD</dt>
            <dd className="mono highlight">{formatPpd(latest?.ppd ?? null)}</dd>
          </div>
          <div>
            <dt>TPF</dt>
            <dd className="mono">{tpf ?? "—"}</dd>
          </div>
        </dl>
        {latest?.progress != null && (
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${Math.min(latest.progress, 100)}%` }}
            />
          </div>
        )}
      </div>

      <div className="card-section">
        <h3>System</h3>
        <dl className="stats">
          <div>
            <dt>CPU</dt>
            <dd>{latest?.cpu_usage != null ? `${latest.cpu_usage}%` : "—"}</dd>
          </div>
          <div>
            <dt>Load</dt>
            <dd className="mono">
              {load ? load.map((n) => n.toFixed(2)).join(" / ") : "—"}
            </dd>
          </div>
          <div>
            <dt>Memory</dt>
            <dd>
              {latest?.memory_percent != null
                ? `${latest.memory_percent}%`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Disk</dt>
            <dd>
              {latest?.disk_percent != null ? `${latest.disk_percent}%` : "—"}
            </dd>
          </div>
          <div>
            <dt>Uptime</dt>
            <dd>{uptime != null ? formatUptime(uptime) : "—"}</dd>
          </div>
        </dl>
      </div>

      <div className="card-section card-footer">
        <dl className="stats stats-inline">
          <div>
            <dt>Updates</dt>
            <dd
              className={
                (latest?.apt_updates ?? 0) > 0 ? "warn-text" : undefined
              }
            >
              {latest?.apt_updates ?? 0}
            </dd>
          </div>
          <div>
            <dt>Reboot</dt>
            <dd className={latest?.reboot_required ? "warn-text" : undefined}>
              {latest?.reboot_required ? "required" : "no"}
            </dd>
          </div>
          <div>
            <dt>Last seen</dt>
            <dd>{formatLastSeen(machine.last_seen)}</dd>
          </div>
        </dl>
        {errors.length > 0 && (
          <details className="errors">
            <summary>{errors.length} recent log errors</summary>
            <ul>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </article>
  );
}

export default function App() {
  const [data, setData] = useState<MachinesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await fetchMachines();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const onlineCount = data?.machines.filter((m) => m.online).length ?? 0;

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Folding@home Farm</p>
          <h1>FoldOps</h1>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="label">Farm PPD</span>
            <span className="value mono">
              {data ? formatPpd(data.farm_ppd) : "—"}
            </span>
          </div>
          <div className="hero-stat">
            <span className="label">Nodes</span>
            <span className="value">
              {onlineCount}/{data?.machines.length ?? 0} online
            </span>
          </div>
        </div>
      </header>

      {loading && !data && <p className="message">Loading farm status…</p>}
      {error && <p className="message error">{error}</p>}

      <main className="grid">
        {data?.machines
          .slice()
          .sort((a, b) => a.hostname.localeCompare(b.hostname))
          .map((m) => (
            <MachineCard key={m.hostname} machine={m} />
          ))}
      </main>

      {data?.machines.length === 0 && !loading && (
        <p className="message">No agents have reported yet.</p>
      )}

      <footer className="footer">
        Auto-refresh every 30s · offline after 2m without heartbeat
      </footer>
    </div>
  );
}
