import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MachineCard } from "../components/MachineCard";
import { PageLayout } from "../components/PageLayout";
import { fetchMachines } from "../api";
import { formatPpd } from "../utils/format";
import type { MachinesResponse } from "../types";

export function Dashboard() {
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
    <PageLayout
      eyebrow="Folding@home Farm"
      title="FoldOps"
      backLink={{ href: "/", label: "← Kiosk view" }}
      footer="Auto-refresh every 30s · offline after 2m without heartbeat"
      headerAside={
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
      }
    >
      {loading && !data && <p className="message">Loading farm status…</p>}
      {error && <p className="message error">{error}</p>}

      <div className="grid">
        {data?.machines
          .slice()
          .sort((a, b) => a.hostname.localeCompare(b.hostname))
          .map((m) => (
            <MachineCard key={m.hostname} machine={m} />
          ))}
      </div>

      {data?.machines.length === 0 && !loading && (
        <p className="message">No agents have reported yet.</p>
      )}
    </PageLayout>
  );
}
