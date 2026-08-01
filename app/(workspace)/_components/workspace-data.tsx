"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { VERIFIED_RUN_SNAPSHOT, type VerifiedRun } from "../../../lib/verified-run";
import type { JobEvent, JobState } from "../../../lib/job-contract";

export type ConnectionState = "checking" | "live" | "snapshot";
export type WorkerConnectionState =
  | "checking"
  | "idle"
  | "processing"
  | "offline";

export type TranscriptReview = {
  detectedText: string;
  languageProbability: number | null;
  meanWordConfidence: number | null;
  reasonCodes: string[];
  trailingText: string;
};

export type TimingReview = {
  attemptNumber: number;
  currentTranslation: string;
  instruction: string;
  protectedTerms: string[];
  requestedAction: string;
  segmentId: string;
  targetSeconds: number;
};

export type ActiveJob = {
  events: JobEvent[];
  finalAvailable: boolean;
  jobId: string;
  projectId: string;
  request: {
    created_at: string;
    source_filename: string;
    source_size_bytes: number;
    target_language: string;
  };
  state: JobState;
  statusUrl: string;
  timingReview?: TimingReview;
  transcriptReview?: TranscriptReview;
};

export const ACTIVE_JOB_STORAGE_KEY = "toluva-active-b2-job";
const ACTIVE_JOB_POLL_MILLISECONDS = 20_000;

async function fetchVerifiedRun(): Promise<VerifiedRun> {
  const response = await fetch("/api/run", {
    headers: { Accept: "application/json" },
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    run?: VerifiedRun;
  };
  if (!response.ok || !payload.ok || !payload.run) {
    throw new Error("live B2 run unavailable");
  }
  return payload.run;
}

export async function fetchJobStatus(
  statusUrl: string,
): Promise<Omit<ActiveJob, "statusUrl">> {
  const response = await fetch(statusUrl, {
    headers: { Accept: "application/json" },
  });
  const payload = (await response.json()) as {
    job?: Omit<ActiveJob, "statusUrl">;
    ok?: boolean;
  };
  if (!response.ok || !payload.ok || !payload.job) {
    throw new Error(
      response.status === 404 ? "job_pointer_expired" : "job_status_unavailable",
    );
  }
  return payload.job;
}

async function fetchWorkerStatus(): Promise<WorkerConnectionState> {
  const response = await fetch("/api/worker-status", {
    headers: { Accept: "application/json" },
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    worker?: { state?: WorkerConnectionState };
  };
  if (!response.ok || !payload.ok || !payload.worker?.state) {
    return "offline";
  }
  return payload.worker.state;
}

type WorkspaceValue = {
  activeJob: ActiveJob | null;
  adoptJob: (job: ActiveJob) => void;
  connection: ConnectionState;
  liveIntakeEnabled: boolean;
  notice: string | null;
  publicDailyJobLimit: number;
  refreshRun: () => Promise<boolean>;
  run: VerifiedRun;
  setNotice: (value: string | null) => void;
  statusWarning: string | null;
  workerConnection: WorkerConnectionState;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

/**
 * Owns the state the old single-page app kept in one component: the verified
 * run, the B2 connection, the worker heartbeat, and the durable job pointer.
 * Hoisting it here keeps one poll per concern no matter how many routes read
 * from it.
 */
export function WorkspaceProvider({
  children,
  liveIntakeEnabled,
  publicDailyJobLimit,
}: {
  children: React.ReactNode;
  liveIntakeEnabled: boolean;
  publicDailyJobLimit: number;
}) {
  const [run, setRun] = useState<VerifiedRun>(VERIFIED_RUN_SNAPSHOT);
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [workerConnection, setWorkerConnection] =
    useState<WorkerConnectionState>("checking");
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [statusWarning, setStatusWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeJobState = activeJob?.state;
  const activeJobStatusUrl = activeJob?.statusUrl;

  const refreshRun = useCallback(async () => {
    setConnection("checking");
    try {
      setRun(await fetchVerifiedRun());
      setConnection("live");
      return true;
    } catch {
      setRun(VERIFIED_RUN_SNAPSHOT);
      setConnection("snapshot");
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchVerifiedRun()
      .then((liveRun) => {
        if (cancelled) return;
        setRun(liveRun);
        setConnection("live");
      })
      .catch(() => {
        if (cancelled) return;
        setRun(VERIFIED_RUN_SNAPSHOT);
        setConnection("snapshot");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refreshWorker = () => {
      if (document.visibilityState !== "visible") return;
      fetchWorkerStatus()
        .then((state) => {
          if (!cancelled) setWorkerConnection(state);
        })
        .catch(() => {
          if (!cancelled) setWorkerConnection("offline");
        });
    };
    refreshWorker();
    document.addEventListener("visibilitychange", refreshWorker);
    window.addEventListener("focus", refreshWorker);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", refreshWorker);
      window.removeEventListener("focus", refreshWorker);
    };
  }, []);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
    if (!stored) return;
    try {
      const handle = JSON.parse(stored) as {
        jobId?: string;
        projectId?: string;
        statusUrl?: string;
      };
      if (!handle.jobId || !handle.projectId || !handle.statusUrl) return;
      const statusUrl = handle.statusUrl;
      fetchJobStatus(statusUrl)
        .then((job) => setActiveJob({ ...job, statusUrl }))
        .catch((error) => {
          if (error instanceof Error && error.message === "job_pointer_expired") {
            window.sessionStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
            setStatusWarning(
              "An expired saved job link was cleared from this browser.",
            );
            return;
          }
          setStatusWarning(
            "The saved B2 job pointer could not be refreshed yet.",
          );
        });
    } catch {
      window.sessionStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (
      !activeJobState ||
      !activeJobStatusUrl ||
      ["completed", "failed", "blocked"].includes(activeJobState)
    ) {
      return;
    }
    const interval = window.setInterval(() => {
      fetchJobStatus(activeJobStatusUrl)
        .then((job) => {
          setActiveJob({ ...job, statusUrl: activeJobStatusUrl });
          setStatusWarning(null);
        })
        .catch(() =>
          setStatusWarning(
            "Live status is temporarily unavailable; the B2 queue record is still durable.",
          ),
        );
    }, ACTIVE_JOB_POLL_MILLISECONDS);
    return () => window.clearInterval(interval);
  }, [activeJobState, activeJobStatusUrl]);

  const value = useMemo<WorkspaceValue>(
    () => ({
      activeJob,
      adoptJob: setActiveJob,
      connection,
      liveIntakeEnabled,
      notice,
      publicDailyJobLimit,
      refreshRun,
      run,
      setNotice,
      statusWarning,
      workerConnection,
    }),
    [
      activeJob,
      connection,
      liveIntakeEnabled,
      notice,
      publicDailyJobLimit,
      refreshRun,
      run,
      statusWarning,
      workerConnection,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  }
  return value;
}
