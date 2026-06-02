import type { MachineSummary } from "../types";
import { TempGauge } from "./TempGauge";

function statusLabel(machine: MachineSummary): string {
  if (!machine.online) return "offline";
  const fah = machine.latest?.fah_status ?? "unknown";
  if (fah === "active") return "folding";
  if (fah === "inactive") return "idle";
  if (fah === "failed") return "failed";
  return fah;
}

export function CompactAgentTile({ machine }: { machine: MachineSummary }) {
  const latest = machine.latest;
  const progress = latest?.progress;
  const cpuTemp = latest?.cpu_temp ?? latest?.payload?.system.cpuTemp ?? null;
  const status = statusLabel(machine);

  return (
    <article
      className={`kiosk-tile ${machine.online ? "kiosk-tile--online" : "kiosk-tile--offline"}`}
    >
      <header className="kiosk-tile-head">
        <h2 className="kiosk-tile-name">{machine.hostname}</h2>
        <span
          className={`kiosk-tile-status ${machine.online ? "kiosk-tile-status--ok" : "kiosk-tile-status--warn"}`}
        >
          {status}
        </span>
      </header>

      <TempGauge celsius={cpuTemp} />

      <div className="kiosk-tile-progress">
        <div className="kiosk-progress-bar" role="progressbar"
          aria-valuenow={progress ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Work unit progress"
        >
          <div
            className="kiosk-progress-fill"
            style={{ width: `${progress != null ? Math.min(progress, 100) : 0}%` }}
          />
        </div>
        <span className="kiosk-progress-pct mono">
          {progress != null ? `${progress.toFixed(0)}%` : "—"}
        </span>
      </div>
    </article>
  );
}
