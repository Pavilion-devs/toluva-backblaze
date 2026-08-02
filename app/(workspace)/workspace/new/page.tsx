"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  MAX_CLIP_SECONDS,
  MAX_TTS_CALLS_PER_JOB,
  MAX_TTS_CHARACTERS_PER_JOB,
  MAX_UPLOAD_BYTES,
  MIN_CLIP_SECONDS,
} from "../../../../lib/job-contract";
import { megabytes } from "../../../../lib/format";
import {
  buttonClass,
  Checkbox,
  Chip,
  DataList,
  MetaLabel,
  PageHeader,
  Panel,
  ProgressBar,
  Spinner,
} from "../../_components/ui";
import {
  ACTIVE_JOB_STORAGE_KEY,
  fetchJobStatus,
  useWorkspace,
} from "../../_components/workspace-data";

type UploadState = "idle" | "inspecting" | "ready" | "uploading" | "error";

type JobCreationPayload = {
  job?: { jobId: string; projectId: string; statusUrl: string };
  message?: string;
  ok?: boolean;
};

async function readJobCreationPayload(
  response: Response,
): Promise<JobCreationPayload> {
  const raw = await response.text();
  if ((response.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      return JSON.parse(raw) as JobCreationPayload;
    } catch {
      // Fall through to a stable public error instead of exposing a parser
      // exception from an upstream gateway response.
    }
  }
  return {
    message:
      response.status === 413
        ? `The hosted upload limit was exceeded. Choose an MP4 no larger than ${megabytes(MAX_UPLOAD_BYTES)}.`
        : "The public upload gateway could not accept this file. No provider was called.",
    ok: false,
  };
}

/** Reads duration from the local file so the clip is checked before upload. */
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

const contract: Array<[string, string]> = [
  ["Language", "German · DE-DE"],
  ["Purpose", "Internal training"],
  ["Voice", "Disclosed stock synthetic"],
  ["Protected term", "Toluva"],
];

type CheckState = "pass" | "fail" | "pending";

function Check({ label, state }: { label: string; state: CheckState }) {
  return (
    <li className="flex items-start gap-2.5 text-body">
      <span
        aria-hidden="true"
        className={`mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-label font-bold ${
          state === "pass"
            ? "bg-fit-green text-white"
            : state === "fail"
              ? "bg-fit-red text-white"
              : "border border-slate-300 bg-white text-slate-400"
        }`}
      >
        {state === "pass" ? "✓" : state === "fail" ? "!" : ""}
      </span>
      <span
        className={
          state === "pass"
            ? "text-ink"
            : state === "fail"
              ? "text-fit-red"
              : "text-slate-500"
        }
      >
        {label}
      </span>
    </li>
  );
}

export default function NewLocalizationPage() {
  const {
    adoptJob,
    liveIntakeEnabled,
    publicDailyJobLimit,
    setNotice,
    workerConnection,
  } = useWorkspace();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const selectionVersion = useRef(0);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [clipDuration, setClipDuration] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [disclosureAcknowledged, setDisclosureAcknowledged] = useState(false);

  // Object URLs for the local preview must be revoked when they are replaced.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function selectSourceFile(file: File | null) {
    const version = ++selectionVersion.current;
    setSourceFile(null);
    setClipDuration(null);
    setPreviewUrl(null);
    setError(null);
    if (!file) {
      setState("idle");
      return;
    }
    if (file.type !== "video/mp4") {
      setState("error");
      setError("Choose an MP4 video.");
      return;
    }
    if (file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
      setState("error");
      setError(
        `The MP4 must be no larger than ${megabytes(MAX_UPLOAD_BYTES)}.`,
      );
      return;
    }

    setState("inspecting");
    try {
      const duration = await inspectVideo(file);
      if (version !== selectionVersion.current) return;
      if (duration < MIN_CLIP_SECONDS || duration > MAX_CLIP_SECONDS) {
        throw new Error("clip_duration_out_of_range");
      }
      setSourceFile(file);
      setClipDuration(duration);
      setPreviewUrl(URL.createObjectURL(file));
      setState("ready");
    } catch {
      if (version !== selectionVersion.current) return;
      setState("error");
      setError(
        `Use a ${MIN_CLIP_SECONDS}–${MAX_CLIP_SECONDS} second MP4 with one English speech turn.`,
      );
    }
  }

  async function createLocalizationJob() {
    if (!sourceFile || clipDuration === null) return;
    setState("uploading");
    setError(null);
    try {
      const form = new FormData();
      form.set("source", sourceFile);
      form.set("durationSeconds", clipDuration.toString());
      form.set("targetLanguage", "de-DE");
      form.set("purpose", "internal-training");
      form.set("sourceRightsConfirmed", String(rightsConfirmed));
      form.set(
        "syntheticVoiceDisclosureAcknowledged",
        String(disclosureAcknowledged),
      );
      const response = await fetch("/api/jobs", { body: form, method: "POST" });
      const payload = await readJobCreationPayload(response);
      if (!response.ok || !payload.ok || !payload.job) {
        throw new Error(payload.message ?? "job_creation_failed");
      }
      const job = await fetchJobStatus(payload.job.statusUrl);
      adoptJob({ ...job, statusUrl: payload.job.statusUrl });
      window.sessionStorage.setItem(
        ACTIVE_JOB_STORAGE_KEY,
        JSON.stringify(payload.job),
      );
      setNotice(
        "Source and governed job request are now durably queued in Backblaze B2.",
      );
      setSourceFile(null);
      setClipDuration(null);
      setPreviewUrl(null);
      setState("idle");
      router.push(`/workspace/runs/${encodeURIComponent(payload.job.jobId)}`);
    } catch (caught) {
      // Preserve a valid inspected clip so a transient B2/network failure can
      // be retried without forcing the user to select the source again.
      setState(sourceFile && clipDuration !== null ? "ready" : "error");
      setError(
        caught instanceof Error
          ? caught.message
          : "The durable job could not be created.",
      );
    }
  }

  const busy = state === "uploading";
  const sizeOk = sourceFile ? sourceFile.size <= MAX_UPLOAD_BYTES : null;
  const durationOk =
    clipDuration === null
      ? null
      : clipDuration >= MIN_CLIP_SECONDS && clipDuration <= MAX_CLIP_SECONDS;
  const consentOk = rightsConfirmed && disclosureAcknowledged;
  const canSubmit = state === "ready" && consentOk && liveIntakeEnabled;

  return (
    <div className="flex flex-col gap-7 md:gap-8">
      <PageHeader
        description="Upload one short English clip. Toluva verifies the intake contract, localizes it to German, measures timing drift, and preserves every stage in Backblaze B2."
        eyebrow="Create a localization"
        title="New localization"
      />

      {!liveIntakeEnabled && (
        <div
          className="flex items-start gap-3 rounded-card border border-fit-amber/25 bg-fit-amber-soft px-5 py-4"
          role="status"
        >
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fit-amber text-micro font-bold text-white"
          >
            !
          </span>
          <p className="text-body text-slate-700">
            <strong className="font-semibold text-ink">
              New jobs are paused.
            </strong>{" "}
            You can prepare and inspect a source now; queueing reopens when the
            generation worker&apos;s public intake window is enabled.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <div
            className={`relative rounded-card border-2 border-dashed transition-colors ${
              dragging
                ? "border-ink bg-cream"
                : state === "error"
                  ? "border-fit-red/40 bg-fit-red-soft/30"
                  : sourceFile
                    ? "border-fit-green/35 bg-white"
                    : "border-slate-200 bg-white hover:border-slate-300"
            }`}
            onDragEnter={(event) => {
              event.preventDefault();
              dragDepth.current += 1;
              setDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              // Counted, because dragleave also fires when crossing children.
              dragDepth.current -= 1;
              if (dragDepth.current <= 0) {
                dragDepth.current = 0;
                setDragging(false);
              }
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              dragDepth.current = 0;
              setDragging(false);
              if (busy) return;
              void selectSourceFile(event.dataTransfer.files?.[0] ?? null);
            }}
          >
            <input
              accept="video/mp4,.mp4"
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                // Clearing the native value allows Remove → choose the same
                // file, which browsers otherwise suppress as no change.
                event.currentTarget.value = "";
                void selectSourceFile(file);
              }}
              ref={inputRef}
              type="file"
            />

            {sourceFile && previewUrl ? (
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
                <video
                  aria-label={`Preview of ${sourceFile.name}`}
                  className="aspect-video w-full shrink-0 rounded-2xl bg-ink object-cover sm:w-52"
                  muted
                  playsInline
                  preload="metadata"
                  src={previewUrl}
                />
                <div className="min-w-0 flex-1">
                  <Chip tone="green">Ready to queue</Chip>
                  <strong className="mt-2 block truncate text-[15px] font-bold text-ink">
                    {sourceFile.name}
                  </strong>
                  <p className="mt-1 font-mono text-caption text-slate-500">
                    {clipDuration?.toFixed(2)}s · {megabytes(sourceFile.size)} ·
                    MP4
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className={`${buttonClass("secondary")} px-4 py-2 text-caption`}
                      disabled={busy}
                      onClick={() => inputRef.current?.click()}
                    >
                      Replace
                    </button>
                    <button
                      className={`${buttonClass("quiet")} px-3 py-2 text-caption`}
                      disabled={busy}
                      onClick={() => void selectSourceFile(null)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-6 py-10 text-center sm:py-12">
                <div
                  className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border transition-colors ${
                    state === "error"
                      ? "border-fit-red/20 bg-fit-red-soft text-fit-red"
                      : "border-slate-100 bg-cream text-slate-600"
                  }`}
                >
                  {state === "inspecting" ? (
                    <Spinner className="h-6 w-6" />
                  ) : (
                    <svg
                      aria-hidden="true"
                      fill="none"
                      height="24"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.6"
                      viewBox="0 0 24 24"
                      width="24"
                    >
                      <path d="M12 16V4M7 9l5-5 5 5" />
                      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                    </svg>
                  )}
                </div>
                <strong className="block text-lg font-bold text-ink">
                  {state === "inspecting"
                    ? "Reading the clip…"
                    : dragging
                      ? "Drop to load"
                      : "Drop an MP4 here"}
                </strong>
                <p className="mx-auto mt-1.5 max-w-sm text-body text-slate-500">
                  One English speaker, {MIN_CLIP_SECONDS}–{MAX_CLIP_SECONDS}{" "}
                  seconds, up to {megabytes(MAX_UPLOAD_BYTES)}. The clip must say
                  “Toluva”.
                </p>
                <button
                  className={`${buttonClass("secondary")} mt-4`}
                  disabled={busy || state === "inspecting"}
                  onClick={() => inputRef.current?.click()}
                >
                  Choose a file
                </button>
              </div>
            )}
          </div>

          <Panel eyebrow="Intake checks" title="Verified before upload">
            <ul className="flex flex-col gap-3">
              <Check
                label={
                  sourceFile ? `${sourceFile.name} selected` : "MP4 file selected"
                }
                state={
                  sourceFile ? "pass" : state === "error" ? "fail" : "pending"
                }
              />
              <Check
                label={
                  sourceFile
                    ? `${megabytes(sourceFile.size)} · within the ${megabytes(MAX_UPLOAD_BYTES)} limit`
                    : `At most ${megabytes(MAX_UPLOAD_BYTES)}`
                }
                state={sizeOk === null ? "pending" : sizeOk ? "pass" : "fail"}
              />
              <Check
                label={
                  clipDuration !== null
                    ? `${clipDuration.toFixed(2)} seconds · within range`
                    : `Between ${MIN_CLIP_SECONDS} and ${MAX_CLIP_SECONDS} seconds`
                }
                state={
                  durationOk === null ? "pending" : durationOk ? "pass" : "fail"
                }
              />
              <Check
                label="One English speaker, and the clip says “Toluva”"
                state="pending"
              />
              <Check
                label="Upload rights and synthetic-voice disclosure confirmed"
                state={consentOk ? "pass" : "pending"}
              />
            </ul>

            <div className="mt-6 border-t border-slate-100 pt-5">
              <MetaLabel>Required confirmations</MetaLabel>
              <div className="flex flex-col gap-2.5">
                <Checkbox
                  checked={rightsConfirmed}
                  disabled={busy}
                  onChange={setRightsConfirmed}
                >
                  I have the right to upload this clip and create a German
                  localized edition from it.
                </Checkbox>
                <Checkbox
                  checked={disclosureAcknowledged}
                  disabled={busy}
                  onChange={setDisclosureAcknowledged}
                >
                  I understand the German track uses a disclosed ElevenLabs stock
                  synthetic voice and needs human approval before publishing.
                </Checkbox>
              </div>
            </div>

            {error && (
              <div
                className="mt-5 flex items-start gap-3 rounded-2xl border border-fit-red/25 bg-fit-red-soft p-4"
                role="alert"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fit-red text-micro font-bold text-white"
                >
                  !
                </span>
                <div>
                  <strong className="block text-body font-bold text-fit-red">
                    Intake stopped safely
                  </strong>
                  <small className="mt-0.5 block text-caption text-slate-700">
                    {error}
                  </small>
                </div>
              </div>
            )}

            {busy && (
              <div className="mt-5">
                <ProgressBar
                  indeterminate
                  label="Writing source and job request to Backblaze B2…"
                />
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
              <button
                className={buttonClass("primary")}
                disabled={!canSubmit || busy}
                onClick={() => void createLocalizationJob()}
              >
                {busy && <Spinner />}
                {busy ? "Writing durable job…" : "Queue in Backblaze B2"}
              </button>
              {!consentOk && state === "ready" && (
                <span className="text-caption text-slate-500">
                  Confirm both statements above to continue.
                </span>
              )}
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel eyebrow="Locked contract" title="What this run will request">
            <DataList items={contract} />
          </Panel>

          <Panel eyebrow="Write contract" title="Source → queue → status">
            <div className="mb-4">
              <Chip
                pulse={workerConnection === "processing"}
                tone={workerConnection === "offline" ? "amber" : "green"}
              >
                {workerConnection === "offline"
                  ? "Worker offline"
                  : "Worker heartbeat live"}
              </Chip>
            </div>
            <p className="text-body text-slate-600">
              {workerConnection === "offline"
                ? "The worker is currently offline. The job will stay durable in B2 until it reconnects — nothing is lost and no provider is called."
                : "Credentials remain server-side and generation starts only after the worker claims the job."}
            </p>
            <div className="mt-4 rounded-2xl border border-slate-100 bg-cream p-4">
              <MetaLabel>Bounded public capacity</MetaLabel>
              <p className="text-body text-slate-600">
                At most {MAX_TTS_CALLS_PER_JOB} speech calls and{" "}
                {MAX_TTS_CHARACTERS_PER_JOB} generated characters per job, with{" "}
                {publicDailyJobLimit} admission slots per UTC day. The worker
                validates the exact slot before any provider call.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
