import { z } from "zod";

export const memorySchema = z.object({
  total: z.number(),
  used: z.number(),
  free: z.number(),
  percent: z.number(),
});

export const diskSchema = z.object({
  total: z.number(),
  used: z.number(),
  free: z.number(),
  percent: z.number(),
});

export const networkSchema = z.object({
  rxBytes: z.number(),
  txBytes: z.number(),
  rxSec: z.number().nullable(),
  txSec: z.number().nullable(),
});

export const systemSchema = z.object({
  uptime: z.number(),
  loadAvg: z.tuple([z.number(), z.number(), z.number()]),
  cpuUsage: z.number(),
  memory: memorySchema,
  disk: diskSchema,
  network: networkSchema,
  cpuTemp: z.number().nullable(),
  chassisTemp: z.number().nullable(),
});

export const fahSchema = z.object({
  systemdStatus: z.enum(["active", "inactive", "failed", "unknown"]),
  project: z.string().nullable(),
  run: z.number().nullable(),
  clone: z.number().nullable(),
  gen: z.number().nullable(),
  progress: z.number().nullable(),
  ppd: z.number().nullable(),
  tpf: z.string().nullable(),
  recentErrors: z.array(z.string()),
});

export const maintenanceSchema = z.object({
  aptUpdatesAvailable: z.number(),
  rebootRequired: z.boolean(),
});

export const nodeLogsSchema = z.object({
  fah: z.array(z.string()).max(200),
  work: z.array(z.string()).max(200),
  fahPath: z.string().optional(),
  workPath: z.string().optional(),
});

export const ingestPayloadSchema = z.object({
  hostname: z.string().min(1),
  timestamp: z.string().datetime(),
  system: systemSchema,
  fah: fahSchema,
  maintenance: maintenanceSchema,
  logs: nodeLogsSchema.optional(),
});

export type IngestPayload = z.infer<typeof ingestPayloadSchema>;
export type NodeLogs = z.infer<typeof nodeLogsSchema>;
