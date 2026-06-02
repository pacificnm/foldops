import { formatTemp } from "../utils/format";

const TEMP_MIN = 30;
const TEMP_MAX = 95;

function tempPercent(celsius: number): number {
  return Math.min(
    100,
    Math.max(0, ((celsius - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)) * 100),
  );
}

function tempColor(celsius: number): string {
  if (celsius >= 85) return "var(--danger)";
  if (celsius >= 70) return "var(--warn)";
  return "var(--ok)";
}

export function TempGauge({ celsius }: { celsius: number | null }) {
  if (celsius == null) {
    return (
      <div className="temp-gauge temp-gauge--empty" aria-label="CPU temperature unknown">
        <div className="temp-gauge-track">
          <div className="temp-gauge-fill" style={{ width: "0%" }} />
        </div>
        <span className="temp-gauge-label">CPU</span>
        <span className="temp-gauge-value mono">—</span>
      </div>
    );
  }

  const pct = tempPercent(celsius);
  const color = tempColor(celsius);

  return (
    <div
      className="temp-gauge"
      aria-label={`CPU temperature ${formatTemp(celsius)}`}
    >
      <div className="temp-gauge-track">
        <div
          className="temp-gauge-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="temp-gauge-label">CPU</span>
      <span className="temp-gauge-value mono" style={{ color }}>
        {formatTemp(celsius)}
      </span>
    </div>
  );
}
