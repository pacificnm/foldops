import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CompactAgentTile } from "../components/CompactAgentTile";
import { fetchMachines } from "../api";
import type { MachinesResponse } from "../types";
import "../kiosk.css";

export function KioskHome() {
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

  const machines =
    data?.machines.slice().sort((a, b) => a.hostname.localeCompare(b.hostname)) ??
    [];
  const onlineCount = machines.filter((m) => m.online).length;

  return (
    <div className="kiosk-shell">
      <header className="kiosk-header">
        <div className="kiosk-header-main">
          <p className="kiosk-eyebrow">FoldOps</p>
          <h1 className="kiosk-title">Farm</h1>
        </div>
        <p className="kiosk-summary">
          <span className="kiosk-summary-online">{onlineCount}</span>
          <span className="kiosk-summary-sep">/</span>
          <span>{machines.length}</span>
          <span className="kiosk-summary-label"> online</span>
        </p>
        <Link to="/dashboard" className="kiosk-dashboard-link">
          Full dashboard →
        </Link>
      </header>

      <main className="kiosk-main">
        {loading && !data && (
          <p className="kiosk-message">Loading…</p>
        )}
        {error && <p className="kiosk-message kiosk-message--error">{error}</p>}

        {machines.length > 0 && (
          <div
            className={`kiosk-grid${machines.length > 4 ? " kiosk-grid--many" : ""}`}
          >
            {machines.map((m) => (
              <CompactAgentTile key={m.hostname} machine={m} />
            ))}
          </div>
        )}

        {data?.machines.length === 0 && !loading && (
          <p className="kiosk-message">No agents yet.</p>
        )}
      </main>

      <footer className="kiosk-footer">Updates every 30s</footer>
    </div>
  );
}
