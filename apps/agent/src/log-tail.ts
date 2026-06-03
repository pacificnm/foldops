import { readFile } from "node:fs/promises";

const DEFAULT_MAX_BYTES = 256 * 1024;

export async function readLogTail(
  logPath: string,
  maxLines: number,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<{ lines: string[]; path: string } | null> {
  let content: string;
  try {
    content = await readFile(logPath, "utf8");
  } catch {
    return null;
  }

  if (content.length > maxBytes) {
    content = content.slice(-maxBytes);
    const firstNl = content.indexOf("\n");
    if (firstNl >= 0) content = content.slice(firstNl + 1);
  }

  const lines = content.split("\n").filter((l) => l.length > 0);
  return {
    path: logPath,
    lines: lines.slice(-maxLines),
  };
}
