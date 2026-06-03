export async function sendWebhookAlert(
  webhookUrl: string,
  lines: string[],
): Promise<void> {
  if (lines.length === 0) return;

  const content = lines.join("\n");
  const body = JSON.stringify({ content });

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Webhook ${res.status}: ${text.slice(0, 200)}`);
  }
}
