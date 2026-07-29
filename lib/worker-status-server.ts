import "server-only";

import { getB2ProjectJson } from "./b2-server";

const WORKER_HEARTBEAT_KEY =
  "projects/system-runtime/workers/primary/heartbeat.json";

type WorkerHeartbeat = {
  engine_version: string;
  lease_expires_at: string;
  observed_at: string;
  record_type: "worker_heartbeat";
  replica_count: number;
  state: string;
};

export type WorkerAvailability = {
  engineVersion: string | null;
  lastSeenAt: string | null;
  online: boolean;
  reason: "healthy" | "lease-expired" | "unavailable";
  replicaCount: number | null;
  state: "checking" | "idle" | "processing" | "offline";
};

export async function readWorkerAvailability(): Promise<WorkerAvailability> {
  try {
    const heartbeat = await getB2ProjectJson<WorkerHeartbeat>(
      WORKER_HEARTBEAT_KEY,
    );
    const observedAt = new Date(heartbeat.observed_at);
    const leaseExpiresAt = new Date(heartbeat.lease_expires_at);
    if (
      heartbeat.record_type !== "worker_heartbeat" ||
      heartbeat.replica_count !== 1 ||
      Number.isNaN(observedAt.valueOf()) ||
      Number.isNaN(leaseExpiresAt.valueOf())
    ) {
      throw new Error("worker_heartbeat_invalid");
    }
    const online = leaseExpiresAt.valueOf() > Date.now();
    return {
      engineVersion: heartbeat.engine_version,
      lastSeenAt: observedAt.toISOString(),
      online,
      reason: online ? "healthy" : "lease-expired",
      replicaCount: heartbeat.replica_count,
      state: online
        ? heartbeat.state === "processing"
          ? "processing"
          : "idle"
        : "offline",
    };
  } catch {
    return {
      engineVersion: null,
      lastSeenAt: null,
      online: false,
      reason: "unavailable",
      replicaCount: null,
      state: "offline",
    };
  }
}
