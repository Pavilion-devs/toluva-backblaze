"use client";

import { useCallback, useEffect, useState } from "react";
import {
  VERIFIED_RUN_SNAPSHOT,
  type VerifiedRun,
} from "../lib/verified-run";
import {
  MAX_CLIP_SECONDS,
  MAX_UPLOAD_BYTES,
  MIN_CLIP_SECONDS,
  type JobEvent,
  type JobState,
} from "../lib/job-contract";

type WorkspaceTab = "timeline" | "assets" | "provenance";
type LanguageCode = "de" | "fr" | "es" | "ja";
type MediaView = "source" | "final";
type ConnectionState = "checking" | "live" | "snapshot";
type WorkerConnectionState =
  | "checking"
  | "idle"
  | "processing"
  | "offline";
type UploadState =
  | "idle"
  | "inspecting"
  | "ready"
  | "uploading"
  | "created"
  | "error";

type ActiveJob = {
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
};

const ACTIVE_JOB_STORAGE_KEY = "toluva-active-b2-job";

const languageOptions: Array<{
  code: LanguageCode;
  localName: string;
  name: string;
}> = [
  { code: "de", name: "German", localName: "Deutsch" },
  { code: "fr", name: "French", localName: "Français" },
  { code: "es", name: "Spanish", localName: "Español" },
  { code: "ja", name: "Japanese", localName: "日本語" },
];

function shortHash(value: string, start = 8, end = 6) {
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function seconds(value: number) {
  return `${value.toFixed(3)}s`;
}

function percent(value: number) {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${Math.abs(value * 100).toFixed(2)}%`;
}

function readableAction(value: string) {
  return value.replaceAll("_", " ");
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}

async function fetchVerifiedRun(): Promise<VerifiedRun> {
  const response = await fetch("/api/run", {
    cache: "no-store",
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

async function inspectVideo(file: File): Promise<number> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const duration = video.duration;
        if (!Number.isFinite(duration)) {
          reject(new Error("clip_metadata_invalid"));
          return;
        }
        resolve(duration);
      };
      video.onerror = () => reject(new Error("clip_metadata_invalid"));
      video.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function fetchJobStatus(
  statusUrl: string,
): Promise<Omit<ActiveJob, "statusUrl">> {
  const response = await fetch(statusUrl, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload = (await response.json()) as {
    job?: Omit<ActiveJob, "statusUrl">;
    ok?: boolean;
  };
  if (!response.ok || !payload.ok || !payload.job) {
    throw new Error("job_status_unavailable");
  }
  return payload.job;
}

async function fetchWorkerStatus(): Promise<WorkerConnectionState> {
  const response = await fetch("/api/worker-status", {
    cache: "no-store",
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

function StatusMark({
  status,
}: {
  status: "ready" | "pending" | "blocked";
}) {
  return (
    <span className={`status-mark status-${status}`} aria-label={status}>
      <span className="status-dot" />
      {status === "ready"
        ? "Verified"
        : status === "pending"
          ? "Not run"
          : "Blocked"}
    </span>
  );
}

export function ToluvaApp() {
  const [run, setRun] = useState<VerifiedRun>(VERIFIED_RUN_SNAPSHOT);
  const [connection, setConnection] =
    useState<ConnectionState>("checking");
  const [workspaceTab, setWorkspaceTab] =
    useState<WorkspaceTab>("timeline");
  const [mediaView, setMediaView] = useState<MediaView>("final");
  const [mediaError, setMediaError] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [requestedLanguage, setRequestedLanguage] =
    useState<LanguageCode>("de");
  const [purpose, setPurpose] = useState("internal-training");
  const [authorizationResult, setAuthorizationResult] = useState<
    "idle" | "approved" | "blocked"
  >("idle");
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [clipDuration, setClipDuration] = useState<number | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [statusWarning, setStatusWarning] = useState<string | null>(null);
  const [workerConnection, setWorkerConnection] =
    useState<WorkerConnectionState>("checking");

  const refreshRun = useCallback(async () => {
    setConnection("checking");
    try {
      const liveRun = await fetchVerifiedRun();
      setRun(liveRun);
      setConnection("live");
      setMediaError(false);
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
        setMediaError(false);
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
      fetchWorkerStatus()
        .then((state) => {
          if (!cancelled) setWorkerConnection(state);
        })
        .catch(() => {
          if (!cancelled) setWorkerConnection("offline");
        });
    };
    refreshWorker();
    const interval = window.setInterval(refreshWorker, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
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
      fetchJobStatus(handle.statusUrl)
        .then((job) =>
          setActiveJob({ ...job, statusUrl: handle.statusUrl! }),
        )
        .catch(() =>
          setStatusWarning(
            "The saved B2 job pointer could not be refreshed yet.",
          ),
        );
    } catch {
      window.sessionStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (
      !activeJob ||
      ["completed", "failed", "blocked"].includes(activeJob.state)
    ) {
      return;
    }
    const interval = window.setInterval(() => {
      fetchJobStatus(activeJob.statusUrl)
        .then((job) => {
          setActiveJob({ ...job, statusUrl: activeJob.statusUrl });
          setStatusWarning(null);
        })
        .catch(() =>
          setStatusWarning(
            "Live status is temporarily unavailable; the B2 queue record is still durable.",
          ),
        );
    }, 3000);
    return () => window.clearInterval(interval);
  }, [activeJob]);

  function openWorkbench(tab: WorkspaceTab) {
    setWorkspaceTab(tab);
    window.setTimeout(() => {
      document.getElementById("workbench")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }

  function openAuthorization(language: LanguageCode = "de") {
    setRequestedLanguage(language);
    setPurpose("internal-training");
    setAuthorizationResult("idle");
    setDialogOpen(true);
  }

  function runAuthorizationCheck() {
    if (
      requestedLanguage !== "de" ||
      purpose !== "internal-training"
    ) {
      setAuthorizationResult("blocked");
      return;
    }
    setAuthorizationResult("approved");
  }

  async function loadCompletedJob() {
    const loadedLive = await refreshRun();
    setDialogOpen(false);
    setAuthorizationResult("idle");
    setNotice(
      loadedLive
        ? "Completed job replayed from B2. No model or provider call was made."
        : "Live B2 is unavailable. The last verified snapshot remains loaded.",
    );
  }

  function resetDialog() {
    setDialogOpen(false);
    setAuthorizationResult("idle");
    setRequestedLanguage("de");
    setPurpose("internal-training");
  }

  function resetIntakeDialog() {
    if (uploadState === "uploading") return;
    setIntakeOpen(false);
    setSourceFile(null);
    setClipDuration(null);
    setUploadState("idle");
    setUploadError(null);
  }

  async function selectSourceFile(file: File | null) {
    setSourceFile(null);
    setClipDuration(null);
    setUploadError(null);
    if (!file) {
      setUploadState("idle");
      return;
    }
    if (file.type !== "video/mp4") {
      setUploadState("error");
      setUploadError("Choose an MP4 video.");
      return;
    }
    if (file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
      setUploadState("error");
      setUploadError("The MP4 must be no larger than 12 MB.");
      return;
    }

    setUploadState("inspecting");
    try {
      const duration = await inspectVideo(file);
      if (
        duration < MIN_CLIP_SECONDS ||
        duration > MAX_CLIP_SECONDS
      ) {
        throw new Error("clip_duration_out_of_range");
      }
      setSourceFile(file);
      setClipDuration(duration);
      setUploadState("ready");
    } catch {
      setUploadState("error");
      setUploadError(
        `Use a ${MIN_CLIP_SECONDS}–${MAX_CLIP_SECONDS} second MP4 with one English speech turn.`,
      );
    }
  }

  async function createLocalizationJob() {
    if (!sourceFile || clipDuration === null) return;
    setUploadState("uploading");
    setUploadError(null);
    try {
      const form = new FormData();
      form.set("source", sourceFile);
      form.set("durationSeconds", clipDuration.toString());
      form.set("targetLanguage", "de-DE");
      form.set("purpose", "internal-training");
      const response = await fetch("/api/jobs", {
        body: form,
        method: "POST",
      });
      const payload = (await response.json()) as {
        job?: {
          jobId: string;
          projectId: string;
          statusUrl: string;
        };
        message?: string;
        ok?: boolean;
      };
      if (!response.ok || !payload.ok || !payload.job) {
        throw new Error(payload.message ?? "job_creation_failed");
      }
      const job = await fetchJobStatus(payload.job.statusUrl);
      const active = {
        ...job,
        statusUrl: payload.job.statusUrl,
      };
      setActiveJob(active);
      window.sessionStorage.setItem(
        ACTIVE_JOB_STORAGE_KEY,
        JSON.stringify(payload.job),
      );
      setUploadState("created");
      setIntakeOpen(false);
      setNotice(
        "Source and governed job request are now durably queued in Backblaze B2.",
      );
      setSourceFile(null);
      setClipDuration(null);
    } catch (error) {
      setUploadState("error");
      setUploadError(
        error instanceof Error
          ? error.message
          : "The durable job could not be created.",
      );
    }
  }

  const sourceOrFinal =
    mediaView === "source"
      ? {
          duration: run.source.durationSeconds,
          label: "English source",
          src: "/api/media?kind=source",
          text: run.source.text,
        }
      : {
          duration: run.edition.finalDurationSeconds,
          label: "German localized edition",
          src: "/api/media?kind=final",
          text: run.edition.translatedText,
        };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            T
          </span>
          <span className="brand-name">TOLUVA</span>
        </div>

        <nav className="primary-nav" aria-label="Primary navigation">
          <a className="nav-link nav-link-active" href="#project">
            <span className="nav-icon" aria-hidden="true">
              ◫
            </span>
            Project
          </a>
          <a className="nav-link" href="#editions">
            <span className="nav-icon" aria-hidden="true">
              ◎
            </span>
            Editions
            <span className="nav-count">1</span>
          </a>
          <button
            className="nav-link nav-button"
            onClick={() => openWorkbench("provenance")}
          >
            <span className="nav-icon" aria-hidden="true">
              ≋
            </span>
            Voice record
          </button>
          <button
            className="nav-link nav-button"
            onClick={() => openWorkbench("assets")}
          >
            <span className="nav-icon" aria-hidden="true">
              ◇
            </span>
            B2 assets
          </button>
        </nav>

        <div className="sidebar-section">
          <p className="sidebar-label">Verified project</p>
          <div className="current-project">
            <span className="project-thumb" aria-hidden="true">
              <span>E2E</span>
            </span>
            <span>
              <strong>German engine proof</strong>
              <small>English → German</small>
            </span>
          </div>
        </div>

        <div className="sidebar-footer">
          <span className="avatar" aria-hidden="true">
            TV
          </span>
          <span>
            <strong>Toluva workspace</strong>
            <small>Private engine view</small>
          </span>
          <button
            className="icon-button"
            aria-label="Refresh B2 connection"
            onClick={() => void refreshRun()}
          >
            ↻
          </button>
        </div>
      </aside>

      <main className="main-content" id="project">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Projects</span>
            <span aria-hidden="true">/</span>
            <strong>{run.project.title}</strong>
          </div>
          <div className="topbar-actions">
            <span
              className={`worker-pill worker-${workerConnection}`}
              title={
                workerConnection === "offline"
                  ? "Uploads remain durable in B2 until the generation worker reconnects."
                  : "The single-replica Python generation worker is reporting through B2."
              }
            >
              <i />
              {workerConnection === "processing"
                ? "WORKER BUSY"
                : workerConnection === "idle"
                  ? "WORKER ONLINE"
                  : workerConnection === "checking"
                    ? "CHECKING WORKER"
                    : "QUEUE ONLY"}
            </span>
            <span
              className={`demo-pill connection-${connection}`}
              title={
                connection === "live"
                  ? "Records are loaded from the private Backblaze B2 project."
                  : "The last verified run snapshot is visible."
              }
            >
              <span className="live-dot" />
              {connection === "live"
                ? "LIVE B2 RUN"
                : connection === "checking"
                  ? "CHECKING B2"
                  : "VERIFIED SNAPSHOT"}
            </span>
            <button
              className="button button-secondary"
              onClick={() => openAuthorization()}
            >
              <span aria-hidden="true">↻</span>
              Replay proof
            </button>
            <button
              className="button button-primary"
              onClick={() => setIntakeOpen(true)}
            >
              <span aria-hidden="true">＋</span>
              New localization
            </button>
          </div>
        </header>

        <div className="content-wrap">
          {notice && (
            <div className="notice-banner" role="status">
              <span>✓</span>
              <strong>{notice}</strong>
              <button aria-label="Dismiss notice" onClick={() => setNotice(null)}>
                ×
              </button>
            </div>
          )}

          {activeJob && (
            <section
              className={`job-progress job-${activeJob.state}`}
              aria-labelledby="active-job-title"
            >
              <div className="job-progress-header">
                <div>
                  <span className="meta-label">DURABLE B2 JOB</span>
                  <h2 id="active-job-title">
                    {activeJob.request.source_filename}
                  </h2>
                  <p>
                    English → German · {activeJob.jobId.slice(0, 18)}…
                  </p>
                </div>
                <span className={`job-state state-${activeJob.state}`}>
                  <i />
                  {activeJob.state}
                </span>
              </div>
              <div className="job-event-track">
                {activeJob.events.map((event) => (
                  <article key={`${event.sequence}-${event.stage}`}>
                    <span>{String(event.sequence).padStart(2, "0")}</span>
                    <div>
                      <strong>{event.label}</strong>
                      <small>{event.message}</small>
                    </div>
                  </article>
                ))}
              </div>
              <div className="job-progress-footer">
                <span>
                  {activeJob.finalAvailable
                    ? "Final record is available in B2."
                    : "Polling append-only B2 stage records every 3 seconds."}
                </span>
                {(statusWarning ||
                  (activeJob.state === "queued" &&
                    workerConnection === "offline")) && (
                  <strong>
                    {statusWarning ??
                      "Worker is offline; this job will remain safely queued."}
                  </strong>
                )}
              </div>
              {activeJob.finalAvailable && (
                <div className="job-output">
                  <div>
                    <span className="meta-label">NEW LOCALIZED OUTPUT</span>
                    <strong>German edition · verified from B2</strong>
                    <small>
                      The player resolves media only from this job&apos;s
                      immutable final record.
                    </small>
                  </div>
                  <video
                    controls
                    preload="metadata"
                    src={
                      `/api/job-media?project=${activeJob.projectId}` +
                      `&job=${activeJob.jobId}&kind=final`
                    }
                  >
                    <track
                      default
                      kind="captions"
                      label="Deutsch"
                      srcLang="de"
                      src={
                        `/api/job-media?project=${activeJob.projectId}` +
                        `&job=${activeJob.jobId}&kind=captions`
                      }
                    />
                  </video>
                </div>
              )}
            </section>
          )}

          <section className="project-intro" aria-labelledby="project-title">
            <div>
              <div className="eyebrow-row">
                <span className="eyebrow">VERIFIED ENGINE RUN</span>
                <span className="version-chip">{run.job.version}</span>
                <span className="development-chip">DEVELOPMENT SAMPLE</span>
              </div>
              <h1 id="project-title">{run.project.title}</h1>
              <p>
                A real English-to-German localization run with timed
                transcription, protected-term translation, authorized
                synthetic speech, timing QA, captions, composition, and
                independently verified B2 output.
              </p>
            </div>
            <div className="project-actions">
              <button
                className="button button-secondary"
                onClick={() => {
                  setMediaView((current) =>
                    current === "source" ? "final" : "source",
                  );
                  setMediaError(false);
                }}
              >
                Show {mediaView === "source" ? "German edition" : "source"}
              </button>
              <button
                className="button button-quiet"
                onClick={() => openWorkbench("provenance")}
              >
                Inspect provenance
              </button>
            </div>
          </section>

          <section className="overview-grid" aria-label="Project overview">
            <article className="source-card">
              <div className="media-preview">
                <div className="media-toolbar">
                  <div className="media-toggle" role="group" aria-label="Media edition">
                    <button
                      aria-pressed={mediaView === "source"}
                      className={mediaView === "source" ? "toggle-active" : ""}
                      onClick={() => {
                        setMediaView("source");
                        setMediaError(false);
                      }}
                    >
                      Source · EN
                    </button>
                    <button
                      aria-pressed={mediaView === "final"}
                      className={mediaView === "final" ? "toggle-active" : ""}
                      onClick={() => {
                        setMediaView("final");
                        setMediaError(false);
                      }}
                    >
                      Localized · DE
                    </button>
                  </div>
                  <span>{seconds(sourceOrFinal.duration)}</span>
                </div>

                {!mediaError ? (
                  <video
                    aria-label={sourceOrFinal.label}
                    controls
                    key={`${mediaView}-${connection}`}
                    onError={() => setMediaError(true)}
                    playsInline
                    preload="metadata"
                    src={sourceOrFinal.src}
                  >
                    {mediaView === "final" && (
                      <track
                        default
                        kind="captions"
                        label="Deutsch"
                        src="/api/media?kind=captions"
                        srcLang="de"
                      />
                    )}
                  </video>
                ) : (
                  <div className="media-offline" role="status">
                    <span className="media-offline-mark">B2</span>
                    <strong>Private media is temporarily unavailable</strong>
                    <p>
                      The verified record remains visible. Refresh the B2
                      connection to retry secure playback.
                    </p>
                    <button
                      className="button button-secondary"
                      onClick={() => {
                        setMediaError(false);
                        void refreshRun();
                      }}
                    >
                      Retry playback
                    </button>
                  </div>
                )}

                <div className="media-transcript">
                  <span>{mediaView === "source" ? "SOURCE" : "GERMAN"}</span>
                  <p>{sourceOrFinal.text}</p>
                </div>
              </div>
              <div className="source-meta">
                <div>
                  <span className="meta-label">
                    {mediaView === "source"
                      ? "SOURCE MASTER"
                      : "LOCALIZED MASTER"}
                  </span>
                  <strong>
                    {mediaView === "source"
                      ? run.source.b2Key.split("/").at(-1)
                      : "localized-de.mp4"}
                  </strong>
                  <small>
                    {mediaView === "source"
                      ? run.project.sourceKind
                      : "H.264 · AAC · mov_text captions"}
                  </small>
                </div>
                <span className="verified-chip">✓ BYTES VERIFIED</span>
              </div>
            </article>

            <article className="control-card" id="voices">
              <div className="control-heading">
                <div>
                  <span className="meta-label">VOICE CONTROL</span>
                  <h2>ElevenLabs stock voice</h2>
                </div>
                <span className="authorization-seal" aria-label="Authorized">
                  ✓
                </span>
              </div>

              <dl className="authorization-list">
                <div>
                  <dt>Voice type</dt>
                  <dd>{run.authorization.voiceType}</dd>
                </div>
                <div>
                  <dt>Approved use</dt>
                  <dd>Internal training</dd>
                </div>
                <div>
                  <dt>Languages</dt>
                  <dd>{run.authorization.allowedLanguages.join(" · ")}</dd>
                </div>
                <div>
                  <dt>Valid through</dt>
                  <dd>{dateLabel(run.authorization.expiresAt)}</dd>
                </div>
              </dl>

              <div className="voice-disclosure">
                <span>SYNTHETIC VOICE DISCLOSURE</span>
                <p>{run.authorization.disclosure}</p>
              </div>

              <button
                className="authorization-link"
                onClick={() => openAuthorization()}
              >
                Test authorization boundary
                <span aria-hidden="true">→</span>
              </button>
            </article>
          </section>

          <section className="metric-grid" aria-label="Run metrics">
            <article className="metric-card">
              <span>VERIFIED EDITIONS</span>
              <strong>1</strong>
              <small>German · complete engine path</small>
            </article>
            <article className="metric-card metric-card-amber">
              <span>TIMING DRIFT</span>
              <strong>{percent(run.timing.driftRatio)}</strong>
              <small>{readableAction(run.timing.action)} · no stretch</small>
            </article>
            <article className="metric-card">
              <span>B2 JOB OBJECTS</span>
              <strong>{run.b2ObjectCount}</strong>
              <small>Source lineage · attempts · final</small>
            </article>
            <article className="metric-card">
              <span>MANIFESTS</span>
              <strong>{run.manifests.length}/4</strong>
              <small>Transcription through composition</small>
            </article>
          </section>

          <section className="production-grid">
            <article className="panel pipeline-panel">
              <div className="panel-heading">
                <div>
                  <span className="meta-label">PRODUCTION RUN</span>
                  <h2>Localization pipeline</h2>
                </div>
                <span className="run-id">{run.job.id}</span>
              </div>

              <div className="pipeline-track">
                {run.pipeline.map((stage, index) => (
                  <div
                    className={`pipeline-step step-${stage.state}`}
                    key={stage.name}
                  >
                    <span className="step-node">
                      {stage.state === "done"
                        ? "✓"
                        : String(index + 1).padStart(2, "0")}
                    </span>
                    <strong>{stage.name}</strong>
                    <small>{stage.detail}</small>
                  </div>
                ))}
              </div>

              <div className="pipeline-footer">
                <span>
                  <i className="legend-dot legend-genblaze" />
                  Four Genblaze runs
                </span>
                <span>
                  <i className="legend-dot legend-b2" />
                  Backblaze B2 system of record
                </span>
                <button onClick={() => openWorkbench("provenance")}>
                  Inspect real run →
                </button>
              </div>
            </article>

            <article className="panel editions-panel" id="editions">
              <div className="panel-heading">
                <div>
                  <span className="meta-label">OUTPUTS</span>
                  <h2>Language editions</h2>
                </div>
                <span className="verified-chip">1 VERIFIED</span>
              </div>

              <div className="edition-list">
                {languageOptions.map((language) => {
                  const isGerman = language.code === "de";
                  return (
                    <button
                      className={`edition-row ${
                        isGerman ? "edition-active" : ""
                      }`}
                      key={language.code}
                      onClick={() => {
                        if (isGerman) {
                          setMediaView("final");
                          setMediaError(false);
                        } else {
                          openAuthorization(language.code);
                        }
                      }}
                    >
                      <span
                        className={`language-code language-${language.code}`}
                      >
                        {language.code.toUpperCase()}
                      </span>
                      <span className="language-name">
                        <strong>{language.name}</strong>
                        <small>{language.localName}</small>
                      </span>
                      <span className="language-result">
                        <StatusMark status={isGerman ? "ready" : "blocked"} />
                        <small>
                          {isGerman
                            ? "Engine run complete"
                            : "Authorization required"}
                        </small>
                      </span>
                      <span className="row-arrow" aria-hidden="true">
                        →
                      </span>
                    </button>
                  );
                })}
              </div>
            </article>
          </section>

          <section className="panel workbench" id="workbench">
            <div className="workbench-heading">
              <div>
                <span className="meta-label">QUALITY & LINEAGE</span>
                <h2>Verified run workbench</h2>
              </div>
              <div className="tab-list" role="tablist" aria-label="Workbench">
                {(
                  [
                    ["timeline", "Timing QA"],
                    ["assets", "B2 assets"],
                    ["provenance", "Provenance"],
                  ] as Array<[WorkspaceTab, string]>
                ).map(([tab, label]) => (
                  <button
                    aria-selected={workspaceTab === tab}
                    className={workspaceTab === tab ? "tab-active" : ""}
                    key={tab}
                    onClick={() => setWorkspaceTab(tab)}
                    role="tab"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {workspaceTab === "timeline" && (
              <div className="timeline-view">
                <div className="timeline-summary">
                  <div>
                    <span className="language-code language-de">DE</span>
                    <span>
                      <strong>German timing report · segment-001</strong>
                      <small>
                        Measured speech duration against the 4.000-second source
                        slot
                      </small>
                    </span>
                  </div>
                  <div className="fit-legend">
                    <span>
                      <i className="fit-green" /> ≤ 8% fit
                    </span>
                    <span>
                      <i className="fit-amber" /> 8–15% pad/review
                    </span>
                    <span>
                      <i className="fit-red" /> &gt; 15% retry
                    </span>
                  </div>
                </div>

                <div className="segment-table live-segment-table">
                  <div className="segment-row segment-header">
                    <span>Segment</span>
                    <span>Source / final translation</span>
                    <span>Slot</span>
                    <span>Generated</span>
                    <span>Final</span>
                    <span>Drift</span>
                  </div>
                  <div className="segment-row segment-review">
                    <span className="segment-id">
                      <strong>segment-001</strong>
                      <small>00:00.000 – 00:04.000</small>
                    </span>
                    <span className="segment-copy">
                      <small>{run.source.text}</small>
                      <strong>{run.edition.translatedText}</strong>
                    </span>
                    <span>{seconds(run.timing.slotSeconds)}</span>
                    <span>{seconds(run.timing.generatedSeconds)}</span>
                    <span>{seconds(run.edition.finalDurationSeconds)}</span>
                    <span
                      className={`drift-pill drift-${run.timing.band}`}
                      title={`${run.timing.attemptCount} explicit TTS attempt`}
                    >
                      {percent(run.timing.driftRatio)}
                    </span>
                  </div>
                </div>

                <div className="correction-note">
                  <span className="correction-icon">↘</span>
                  <div>
                    <strong>Natural silence padding selected</strong>
                    <p>
                      German speech finished{" "}
                      {Math.abs(run.timing.driftSeconds).toFixed(3)} seconds
                      early. The measured drift stayed inside the amber band,
                      so Toluva preserved the delivery and padded the remainder
                      instead of stretching the voice or spending another TTS
                      call.
                    </p>
                  </div>
                  <span className="lineage-chip">
                    {run.timing.attemptCount} TTS ATTEMPT
                  </span>
                </div>
              </div>
            )}

            {workspaceTab === "assets" && (
              <div className="assets-view">
                <div className="storage-banner">
                  <div className="storage-mark" aria-hidden="true">
                    B2
                  </div>
                  <div>
                    <strong>
                      Backblaze B2 is the verified run system of record
                    </strong>
                    <p>
                      The interface reads sanitized records through a
                      server-only bridge. Storage credentials never reach the
                      browser.
                    </p>
                  </div>
                  <span>{run.b2ObjectCount} JOB OBJECTS</span>
                </div>
                <div className="asset-grid">
                  {run.assets.map((asset) => (
                    <article
                      className={`asset-card ${
                        selectedAsset === asset.b2Key ? "asset-selected" : ""
                      }`}
                      key={asset.b2Key}
                    >
                      <span className="asset-kind">{asset.kind}</span>
                      <strong>{asset.name}</strong>
                      <small>{asset.meta}</small>
                      <button
                        aria-label={`Inspect ${asset.name}`}
                        onClick={() =>
                          setSelectedAsset((current) =>
                            current === asset.b2Key ? null : asset.b2Key,
                          )
                        }
                      >
                        {selectedAsset === asset.b2Key ? "×" : "→"}
                      </button>
                      {selectedAsset === asset.b2Key && (
                        <code className="asset-key">{asset.b2Key}</code>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            )}

            {workspaceTab === "provenance" && (
              <div className="provenance-view live-provenance">
                <div className="manifest-card">
                  <div className="manifest-header">
                    <div>
                      <span className="manifest-check">✓</span>
                      <span>
                        <strong>Four canonical manifests verified</strong>
                        <small>
                          Transcription, translation, speech, and composition
                          lineage loaded from B2
                        </small>
                      </span>
                    </div>
                    <span className="verified-chip">4 / 4 VALID</span>
                  </div>
                  <div className="manifest-list">
                    {run.manifests.map((manifest) => (
                      <article key={manifest.runId}>
                        <div>
                          <span>{manifest.stage}</span>
                          <strong>{manifest.provider}</strong>
                          <small>{manifest.model}</small>
                        </div>
                        <div>
                          <span>RUN</span>
                          <code>{shortHash(manifest.runId, 8, 5)}</code>
                        </div>
                        <div>
                          <span>CANONICAL HASH</span>
                          <code>{shortHash(manifest.canonicalHash)}</code>
                        </div>
                        <b>✓</b>
                      </article>
                    ))}
                  </div>
                  <dl>
                    <div>
                      <dt>Final output hash</dt>
                      <dd>{shortHash(run.edition.finalSha256, 12, 8)}</dd>
                    </div>
                    <div>
                      <dt>Protected term</dt>
                      <dd>
                        {run.edition.protectedTerms.join(", ")} · preserved
                      </dd>
                    </div>
                    <div>
                      <dt>Captions</dt>
                      <dd>
                        {run.edition.captionsEmbedded
                          ? "WebVTT + embedded mov_text"
                          : "WebVTT sidecar"}
                      </dd>
                    </div>
                    <div>
                      <dt>Last engine event</dt>
                      <dd>{dateLabel(run.syncedAt)}</dd>
                    </div>
                  </dl>
                </div>

                <div className="consent-card">
                  <span className="meta-label">AUTHORIZATION RECORD</span>
                  <h3>{run.authorization.id}</h3>
                  <p>
                    Authorized for German internal training with a disclosed
                    stock synthetic voice. Human approval is required before
                    publishing.
                  </p>
                  <div className="consent-chain">
                    <span>Decision</span>
                    <code>{run.authorization.code}</code>
                  </div>
                  <div className="consent-chain">
                    <span>Voice model</span>
                    <code>{run.disclosure.voiceModel}</code>
                  </div>
                  <div className="consent-chain">
                    <span>Valid through</span>
                    <code>{dateLabel(run.authorization.expiresAt)}</code>
                  </div>
                  <div className="consent-chain">
                    <span>Disclosure</span>
                    <code>synthetic stock voice</code>
                  </div>
                  <button
                    className="button button-secondary full-width"
                    onClick={() => openAuthorization()}
                  >
                    Test policy boundary
                  </button>
                </div>
              </div>
            )}
          </section>

          <footer className="product-footer">
            <span>
              Toluva engine view ·{" "}
              {connection === "live" ? "live B2 records" : "verified snapshot"}
            </span>
            <span>
              Authorized <i /> Time-fit <i /> Verifiable
            </span>
          </footer>
        </div>
      </main>

      {dialogOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section
            aria-labelledby="authorization-title"
            aria-modal="true"
            className="dialog"
            role="dialog"
          >
            <div className="dialog-header">
              <div>
                <span className="meta-label">PRE-PROVIDER GATE</span>
                <h2 id="authorization-title">Replay governed job</h2>
              </div>
              <button
                aria-label="Close authorization dialog"
                className="dialog-close"
                onClick={resetDialog}
              >
                ×
              </button>
            </div>

            <p className="dialog-intro">
              Toluva evaluates language and purpose before any provider call.
              The completed German job can then be replayed directly from B2
              without spending model credits.
            </p>

            <label className="field">
              <span>Target language</span>
              <select
                onChange={(event) => {
                  setRequestedLanguage(event.target.value as LanguageCode);
                  setAuthorizationResult("idle");
                }}
                value={requestedLanguage}
              >
                <option value="de">German — Deutsch</option>
                <option value="fr">French — Français</option>
                <option value="es">Spanish — Español</option>
                <option value="ja">Japanese — 日本語</option>
              </select>
            </label>

            <label className="field">
              <span>Publishing purpose</span>
              <select
                onChange={(event) => {
                  setPurpose(event.target.value);
                  setAuthorizationResult("idle");
                }}
                value={purpose}
              >
                <option value="internal-training">Internal training</option>
                <option value="customer-education">Customer education</option>
                <option value="public-marketing">Public marketing</option>
              </select>
            </label>

            <div className="policy-scope">
              <span>LIVE AUTHORIZATION SCOPE</span>
              <strong>DE-DE · INTERNAL TRAINING</strong>
              <small>
                Stock synthetic voice · valid through{" "}
                {dateLabel(run.authorization.expiresAt)}
              </small>
            </div>

            {authorizationResult === "approved" && (
              <div className="authorization-result result-approved">
                <span>✓</span>
                <div>
                  <strong>Authorized completed job found</strong>
                  <p>
                    Loading it reuses the verified B2 checkpoint. Whisper,
                    Argos, ElevenLabs, and FFmpeg will not run again.
                  </p>
                </div>
              </div>
            )}

            {authorizationResult === "blocked" && (
              <div className="authorization-result result-blocked">
                <span>!</span>
                <div>
                  <strong>Generation blocked before provider call</strong>
                  <p>
                    The current voice record covers German internal training
                    only. A new authorization is required for this request.
                  </p>
                </div>
              </div>
            )}

            <div className="dialog-actions">
              <button className="button button-quiet" onClick={resetDialog}>
                Cancel
              </button>
              <button
                className="button button-primary"
                onClick={() => {
                  if (authorizationResult === "approved") {
                    void loadCompletedJob();
                  } else {
                    runAuthorizationCheck();
                  }
                }}
              >
                {authorizationResult === "approved"
                  ? "Load completed B2 job"
                  : "Check authorization"}
              </button>
            </div>
          </section>
        </div>
      )}

      {intakeOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section
            aria-labelledby="intake-title"
            aria-modal="true"
            className="dialog intake-dialog"
            role="dialog"
          >
            <div className="dialog-header">
              <div>
                <span className="meta-label">GOVERNED ENGINE INTAKE</span>
                <h2 id="intake-title">Queue a real localization</h2>
              </div>
              <button
                aria-label="Close upload dialog"
                className="dialog-close"
                disabled={uploadState === "uploading"}
                onClick={resetIntakeDialog}
              >
                ×
              </button>
            </div>

            <p className="dialog-intro">
              This first live lane accepts one short English speech turn,
              verifies the German internal-training authorization, and writes
              the source plus immutable job request to Backblaze B2.
            </p>

            <label className="upload-field">
              <span>Source MP4</span>
              <input
                accept="video/mp4,.mp4"
                disabled={uploadState === "uploading"}
                onChange={(event) =>
                  void selectSourceFile(event.target.files?.[0] ?? null)
                }
                type="file"
              />
              <small>
                1–8 seconds · maximum 12 MB · single English speaker · must say
                “Toluva”
              </small>
            </label>

            {uploadState === "inspecting" && (
              <div className="upload-readout upload-reading">
                Inspecting the local clip before upload…
              </div>
            )}

            {sourceFile && clipDuration !== null && (
              <div className="upload-readout upload-ready">
                <span>✓</span>
                <div>
                  <strong>{sourceFile.name}</strong>
                  <small>
                    {clipDuration.toFixed(2)} seconds ·{" "}
                    {(sourceFile.size / 1024 / 1024).toFixed(2)} MB
                  </small>
                </div>
              </div>
            )}

            {uploadError && (
              <div className="upload-readout upload-failed" role="alert">
                <span>!</span>
                <div>
                  <strong>Intake stopped safely</strong>
                  <small>{uploadError}</small>
                </div>
              </div>
            )}

            <div className="intake-contract">
              <div>
                <span>Language</span>
                <strong>German · DE-DE</strong>
              </div>
              <div>
                <span>Purpose</span>
                <strong>Internal training</strong>
              </div>
              <div>
                <span>Voice</span>
                <strong>Disclosed stock synthetic</strong>
              </div>
              <div>
                <span>Protected term</span>
                <strong>Toluva</strong>
              </div>
            </div>

            <div className="policy-scope">
              <span>WRITE CONTRACT</span>
              <strong>SOURCE → QUEUE REQUEST → STATUS EVENTS</strong>
              <small>
                {workerConnection === "offline"
                  ? "Worker is currently offline. The job will stay durable in B2 until it reconnects."
                  : "Worker heartbeat is live. Credentials remain server-side and generation starts only after claim."}
              </small>
            </div>

            <div className="dialog-actions">
              <button
                className="button button-quiet"
                disabled={uploadState === "uploading"}
                onClick={resetIntakeDialog}
              >
                Cancel
              </button>
              <button
                className="button button-primary"
                disabled={uploadState !== "ready"}
                onClick={() => void createLocalizationJob()}
              >
                {uploadState === "uploading"
                  ? "Writing durable job…"
                  : "Queue in Backblaze B2"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
