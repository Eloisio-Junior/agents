import { randomUUID } from "node:crypto";
import config from "@/config";

// Instance identity stamped on every read-API response / outbound webhook payload so a
// fleet dashboard can attribute events to the emitting instance. Stable for the process
// lifetime (single-replica MVP); set INSTANCE_ID to pin it across restarts/replicas.
const instanceId = process.env.INSTANCE_ID || randomUUID();

export const instanceIdentity = {
  instanceId,
  name: config.packageInfo.name,
  version: config.packageInfo.version,
} as const;
