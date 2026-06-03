import type { SnapshotRow } from "../db.js";

const MIN_SNAPSHOTS_IN_WINDOW = 10;
const SPAN_FRACTION = 0.85;

export interface StuckProgressResult {
  progress: number;
  spanHours: number;
  minProgress: number;
  maxProgress: number;
}

/**
 * True when fah-client is active, progress is meaningful, and progress barely
 * moved over at least `stuckMs` of snapshot history.
 */
export function detectStuckProgress(
  snapshotsAsc: SnapshotRow[],
  stuckMs: number,
  opts?: { minProgress?: number; epsilon?: number },
): StuckProgressResult | null {
  if (stuckMs <= 0 || snapshotsAsc.length === 0) return null;

  const minProgress = opts?.minProgress ?? 0.5;
  const epsilon = opts?.epsilon ?? 0.15;

  const latest = snapshotsAsc[snapshotsAsc.length - 1];
  const latestProgress = latest.progress;
  if (
    latest.fah_status !== "active" ||
    latestProgress == null ||
    latestProgress < minProgress
  ) {
    return null;
  }

  const latestMs = new Date(latest.created_at).getTime();
  const cutoffMs = latestMs - stuckMs;

  const inWindow = snapshotsAsc.filter((s) => {
    const t = new Date(s.created_at).getTime();
    return (
      t >= cutoffMs &&
      s.fah_status === "active" &&
      s.progress != null &&
      s.progress >= minProgress
    );
  });

  if (inWindow.length < MIN_SNAPSHOTS_IN_WINDOW) return null;

  const oldest = inWindow[0];
  const spanMs =
    new Date(latest.created_at).getTime() -
    new Date(oldest.created_at).getTime();
  if (spanMs < stuckMs * SPAN_FRACTION) return null;

  const values = inWindow.map((s) => s.progress as number);
  const minP = Math.min(...values);
  const maxP = Math.max(...values);
  if (maxP - minP > epsilon) return null;

  return {
    progress: latestProgress,
    spanHours: Math.round((spanMs / 3_600_000) * 10) / 10,
    minProgress: minP,
    maxProgress: maxP,
  };
}
