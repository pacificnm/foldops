import type { AlertKind, AlertSeverity } from "./types.js";

export type NotifyEventType = "fired" | "resolved" | "recovery";

export interface NotifyEvent {
  type: NotifyEventType;
  severity: AlertSeverity;
  hostname: string;
  kind: AlertKind;
  message: string;
  details?: string | null;
}

export interface DiscordNotifyOptions {
  webhookUrl: string;
  username?: string;
  dashboardUrl?: string | null;
}

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: string;
  url?: string;
}

let lastWebhookError: string | null = null;
let lastWebhookSuccessAt: string | null = null;

export function getWebhookStatus(): {
  last_error: string | null;
  last_success_at: string | null;
} {
  return { last_error: lastWebhookError, last_success_at: lastWebhookSuccessAt };
}

const SEVERITY_COLOR: Record<AlertSeverity, number> = {
  critical: 0xed_42_45,
  warning: 0xfe_e7_5c,
  info: 0x57_f2_87,
};

const RESOLVED_COLOR = 0x57_f2_87;
const RECOVERY_COLOR = 0x58_65_f2;

const KIND_LABEL: Record<AlertKind, string> = {
  node_offline: "Node offline",
  node_online: "Node online",
  cpu_temp_high: "CPU temperature",
  fah_inactive: "FAH inactive",
  fah_failed: "FAH failed",
  fah_errors: "FAH log errors",
};

function isDiscordWebhook(url: string): boolean {
  return /discord\.com\/api\/webhooks/i.test(url);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function machineUrl(dashboardUrl: string | null | undefined, hostname: string): string | undefined {
  if (!dashboardUrl) return undefined;
  const base = dashboardUrl.replace(/\/$/, "");
  return `${base}/machine/${encodeURIComponent(hostname)}`;
}

function buildEmbed(
  event: NotifyEvent,
  dashboardUrl?: string | null,
): DiscordEmbed {
  const now = new Date().toISOString();
  const url = machineUrl(dashboardUrl, event.hostname);

  if (event.type === "resolved") {
    return {
      title: "✅ Resolved",
      description: event.message,
      color: RESOLVED_COLOR,
      fields: [
        { name: "Host", value: event.hostname, inline: true },
        { name: "Type", value: KIND_LABEL[event.kind], inline: true },
      ],
      timestamp: now,
      url,
    };
  }

  if (event.type === "recovery") {
    return {
      title: "🟢 Node back online",
      description: event.message,
      color: RECOVERY_COLOR,
      fields: [{ name: "Host", value: event.hostname, inline: true }],
      timestamp: now,
      url,
    };
  }

  const icon =
    event.severity === "critical"
      ? "🔴"
      : event.severity === "warning"
        ? "🟡"
        : "ℹ️";

  const embed: DiscordEmbed = {
    title: `${icon} ${KIND_LABEL[event.kind]}`,
    description: event.message,
    color: SEVERITY_COLOR[event.severity],
    fields: [
      { name: "Host", value: event.hostname, inline: true },
      {
        name: "Severity",
        value: event.severity,
        inline: true,
      },
    ],
    timestamp: now,
    url,
  };

  if (event.details) {
    embed.fields!.push({
      name: "Details",
      value: truncate(event.details, 1000),
    });
  }

  return embed;
}

async function postDiscordWebhook(
  webhookUrl: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord webhook ${res.status}: ${text.slice(0, 300)}`);
  }
}

async function sendDiscordEvent(
  opts: DiscordNotifyOptions,
  event: NotifyEvent,
): Promise<void> {
  const embed = buildEmbed(event, opts.dashboardUrl);
  await postDiscordWebhook(opts.webhookUrl, {
    username: opts.username ?? "FoldOps",
    embeds: [embed],
  });
}

async function sendPlainWebhook(
  webhookUrl: string,
  events: NotifyEvent[],
): Promise<void> {
  const lines = events.map((e) => {
    const prefix =
      e.type === "resolved"
        ? "✅"
        : e.type === "recovery"
          ? "🟢"
          : e.severity === "critical"
            ? "🔴"
            : e.severity === "warning"
              ? "🟡"
              : "ℹ️";
    return `${prefix} **FoldOps** — ${e.message}`;
  });

  let content = lines.join("\n");
  if (content.length > 1900) {
    content = truncate(content, 1900);
  }

  const body =
    /hooks\.slack\.com/i.test(webhookUrl)
      ? { text: content }
      : { content };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Webhook ${res.status}: ${text.slice(0, 300)}`);
  }
}

/** Send one notification per event (better for Discord mobile pushes). */
export async function sendAlertNotifications(
  opts: DiscordNotifyOptions,
  events: NotifyEvent[],
): Promise<void> {
  if (events.length === 0) return;

  const useDiscord = isDiscordWebhook(opts.webhookUrl);

  try {
    if (useDiscord) {
      for (const event of events) {
        await sendDiscordEvent(opts, event);
        await delay(350);
      }
    } else {
      await sendPlainWebhook(opts.webhookUrl, events);
    }
    lastWebhookError = null;
    lastWebhookSuccessAt = new Date().toISOString();
  } catch (err) {
    lastWebhookError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

export async function sendTestNotification(
  opts: DiscordNotifyOptions,
): Promise<void> {
  await sendAlertNotifications(opts, [
    {
      type: "fired",
      severity: "warning",
      hostname: "fah-test",
      kind: "cpu_temp_high",
      message: "FoldOps test alert — webhook is working",
    },
  ]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
