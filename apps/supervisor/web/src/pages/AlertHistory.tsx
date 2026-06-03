import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageLayout } from "../components/PageLayout";
import { fetchAlertHistory, fetchMachines } from "../api";
import { formatDuration, formatKindLabel } from "../utils/alerts";
import type { AlertHistoryFilter, AlertHistoryItem } from "../types";

const FILTERS: { id: AlertHistoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "resolved", label: "Resolved" },
];

export function AlertHistory() {
  const [filter, setFilter] = useState<AlertHistoryFilter>("all");
  const [hostname, setHostname] = useState("");
  const [alerts, setAlerts] = useState<AlertHistoryItem[]>([]);
  const [counts, setCounts] = useState({ active: 0, resolved: 0, total: 0 });
  const [hosts, setHosts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [history, machines] = await Promise.all([
        fetchAlertHistory({
          status: filter,
          limit: 200,
          hostname: hostname || undefined,
        }),
        fetchMachines(),
      ]);
      setAlerts(history.alerts);
      setCounts(history.counts);
      setHosts(
        machines.machines
          .map((m) => m.hostname)
          .sort((a, b) => a.localeCompare(b)),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [filter, hostname]);

  useEffect(() => {
    setLoading(true);
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <PageLayout
      backLink={{ href: "/dashboard", label: "← Farm dashboard" }}
      eyebrow="Operations"
      title="Alert history"
      footer="Auto-refresh every 30s · recovery notifications (node online) are webhook-only"
      headerAside={
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="label">Active</span>
            <span className="value">{counts.active}</span>
          </div>
          <div className="hero-stat">
            <span className="label">Resolved</span>
            <span className="value">{counts.resolved}</span>
          </div>
        </div>
      }
    >
      <div className="alert-history-toolbar">
        <div className="range-buttons">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`range-btn ${filter === f.id ? "active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <label className="alert-history-host-filter">
          <span className="range-label">Host</span>
          <select
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
          >
            <option value="">All nodes</option>
            {hosts.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && alerts.length === 0 && (
        <p className="message">Loading alert history…</p>
      )}
      {error && <p className="message error">{error}</p>}

      {!loading && alerts.length === 0 && !error && (
        <p className="message">No alerts in this view yet.</p>
      )}

      {alerts.length > 0 && (
        <div className="alert-history-table-wrap">
          <table className="alert-history-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Severity</th>
                <th>Host</th>
                <th>Type</th>
                <th>Message</th>
                <th>Fired</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={`${a.id}-${a.fired_at}`} className={a.active ? "alert-history-row--active" : ""}>
                  <td>
                    <span
                      className={`alert-history-status ${a.active ? "alert-history-status--active" : "alert-history-status--resolved"}`}
                    >
                      {a.active ? "active" : "resolved"}
                    </span>
                  </td>
                  <td>
                    <span className={`alert-history-severity alert-history-severity--${a.severity}`}>
                      {a.severity}
                    </span>
                  </td>
                  <td>
                    <Link to={`/machine/${encodeURIComponent(a.hostname)}`} className="mono">
                      {a.hostname}
                    </Link>
                  </td>
                  <td className="mono alert-history-kind">
                    {formatKindLabel(a.kind)}
                  </td>
                  <td className="alert-history-message">
                    {a.message}
                    {a.details && (
                      <details className="alert-history-details">
                        <summary>Details</summary>
                        <pre>{a.details}</pre>
                      </details>
                    )}
                  </td>
                  <td className="mono alert-history-time">
                    {formatTime(a.fired_at)}
                    {a.resolved_at && (
                      <span className="alert-history-resolved">
                        → {formatTime(a.resolved_at)}
                      </span>
                    )}
                  </td>
                  <td className="mono">{formatDuration(a.duration_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageLayout>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
