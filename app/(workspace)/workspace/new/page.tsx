"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
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
  Chip,
  MetaLabel,
  PageHeader,
  Panel,
} from "../../_components/ui";
import {
  ACTIVE_JOB_STORAGE_KEY,
  fetchJobStatus,
  useWorkspace,
} from "../../_components/workspace-data";

type UploadState = "idle" | "inspecting" | "ready" | "uploading" | "error";

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

const contract = [
  { label: "Language", value: "German · DE-DE" },
  { label: "Purpose", value: "Internal training" },
  { label: "Voice", value: "Disclosed stock synthetic" },
  { label: "Protected term", value: "Toluva" },
];

function Check({
  label,
  state,
}: {
  label: string;
  state: "pass" | "fail" | "pending";
}) {
  const mark = state === "pass" ? "✓" : state === "fail" ? "!" : "·";
  const tone =
    state === "pass"
      ? "text-fit-green"
      : state === "fail"
        ? "text-fit-red"
        : "text-slate-400";
  return (
    <li className="flex items-center gap-2.5 text-[13px] text-slate-600">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-bold ${tone}`}
      >
        {mark}
      </span>
      {label}
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
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [clipDuration, setClipDuration] = useState<number | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [disclosureAcknowledged, setDisclosureAcknowledged] = useState(false);

  async function selectSourceFile(file: File | null) {
    setSourceFile(null);
    setClipDuration(null);
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
      setError("The MP4 must be no larger than 12 MB.");
      return;
    }

    setState("inspecting");
    try {
      const duration = await inspectVideo(file);
      if (duration < MIN_CLIP_SECONDS || duration > MAX_CLIP_SECONDS) {
        throw new Error("clip_duration_out_of_range");
      }
      setSourceFile(file);
      setClipDuration(duration);
      setState("ready");
    } catch {
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
      const payload = (await response.json()) as {
        job?: { jobId: string; projectId: string; statusUrl: string };
        message?: string;
        ok?: boolean;
      };
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
      setState("idle");
      router.push(`/workspace/runs/${encodeURIComponent(payload.job.jobId)}`);
    } catch (caught) {
      setState("error");
      setError(
        caught instanceof Error
          ? caught.message
          : "The durable job could not be created.",
      );
    }
  }

  const sizeOk = sourceFile ? sourceFile.size <= MAX_UPLOAD_BYTES : null;
  const durationOk =
    clipDuration === null
      ? null
      : clipDuration >= MIN_CLIP_SECONDS && clipDuration <= MAX_CLIP_SECONDS;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description="Upload one short English clip. Toluva verifies the intake contract, localizes it to German, measures timing drift, and preserves every stage in Backblaze B2."
        eyebrow="Create a localization"
        title="New localization"
      />

      {!liveIntakeEnabled && (
        <div
          className="rounded-card border border-fit-amber/25 bg-fit-amber-soft px-5 py-4 text-[13px] leading-relaxed text-slate-700"
          role="status"
        >
          <strong className="font-display text-ink">New jobs are paused.</strong>{" "}
          You can prepare and inspect a source now; queueing will reopen when
          the generation worker&apos;s public intake window is enabled.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <div
            className={`rounded-card border-2 border-dashed p-10 text-center transition-colors ${
              dragging
                ? "border-ink bg-white"
                : state === "error"
                  ? "border-fit-red/40 bg-fit-red-soft/40"
                  : "border-slate-200 bg-white"
            }`}
            onDragLeave={() => setDragging(false)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void selectSourceFile(event.dataTransfer.files?.[0] ?? null);
            }}
          >
            <input
              accept="video/mp4,.mp4"
              className="sr-only"
              disabled={state === "uploading"}
              onChange={(event) =>
                void selectSourceFile(event.target.files?.[0] ?? null)
              }
              ref={inputRef}
              type="file"
            />
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-cream text-slate-600">
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
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M12 16V4M7 9l5-5 5 5" />
                <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
            </div>
            <strong className="block font-display text-lg text-ink">
              Drop an MP4 here
            </strong>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate-500">
              One English speaker, {MIN_CLIP_SECONDS}–{MAX_CLIP_SECONDS}{" "}
              seconds, up to {megabytes(MAX_UPLOAD_BYTES)}. The clip must say
              “Toluva”.
            </p>
            <button
              className={`${buttonClass("secondary")} mt-4`}
              disabled={state === "uploading"}
              onClick={() => inputRef.current?.click()}
            >
              Choose a file
            </button>
          </div>

          <Panel eyebrow="Intake checks" title="Verified before upload">
            {state === "inspecting" && (
              <p className="mb-4 text-[13px] font-medium text-slate-500">
                Inspecting the local clip before upload…
              </p>
            )}

            <ul className="flex flex-col gap-2.5">
              <Check
                label={
                  sourceFile
                    ? `${sourceFile.name} selected`
                    : "MP4 file selected"
                }
                state={sourceFile ? "pass" : state === "error" ? "fail" : "pending"}
              />
              <Check
                label={
                  sourceFile
                    ? `${megabytes(sourceFile.size)} · within the 12 MB limit`
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
                state={
                  rightsConfirmed && disclosureAcknowledged
                    ? "pass"
                    : "pending"
                }
              />
            </ul>

            <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 text-left">
              <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-slate-600">
                <input
                  checked={rightsConfirmed}
                  className="mt-0.5 h-4 w-4 accent-slate-950"
                  disabled={state === "uploading"}
                  onChange={(event) => setRightsConfirmed(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  I have the right to upload this clip and create a German
                  localized edition from it.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-slate-600">
                <input
                  checked={disclosureAcknowledged}
                  className="mt-0.5 h-4 w-4 accent-slate-950"
                  disabled={state === "uploading"}
                  onChange={(event) =>
                    setDisclosureAcknowledged(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  I understand the German track uses a disclosed ElevenLabs
                  stock synthetic voice and needs human approval before
                  publishing.
                </span>
              </label>
            </div>

            {error && (
              <div
                className="mt-5 rounded-2xl border border-fit-red/25 bg-fit-red-soft p-4"
                role="alert"
              >
                <strong className="block font-display text-[14px] text-fit-red">
                  Intake stopped safely
                </strong>
                <small className="mt-1 block text-[13px] text-slate-700">
                  {error}
                </small>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-5">
              <button
                className={buttonClass("primary")}
                disabled={
                  state !== "ready" ||
                  !rightsConfirmed ||
                  !disclosureAcknowledged ||
                  !liveIntakeEnabled
                }
                onClick={() => void createLocalizationJob()}
              >
                {state === "uploading"
                  ? "Writing durable job…"
                  : "Queue in Backblaze B2"}
              </button>
              {sourceFile && (
                <button
                  className={buttonClass("secondary")}
                  disabled={state === "uploading"}
                  onClick={() => void selectSourceFile(null)}
                >
                  Clear
                </button>
              )}
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel eyebrow="Locked contract" title="What this run will request">
            <dl className="flex flex-col divide-y divide-slate-100">
              {contract.map((item) => (
                <div
                  className="flex items-baseline justify-between gap-4 py-2.5"
                  key={item.label}
                >
                  <dt className="text-[13px] text-slate-500">{item.label}</dt>
                  <dd className="text-right font-mono text-[13px] font-medium text-ink">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel eyebrow="Write contract" title="Source → queue → status">
            <div className="mb-4 flex items-center gap-2">
              <Chip tone={workerConnection === "offline" ? "amber" : "green"}>
                {workerConnection === "offline"
                  ? "Worker offline"
                  : "Worker heartbeat live"}
              </Chip>
            </div>
            <p className="text-[13px] leading-relaxed text-slate-600">
              {workerConnection === "offline"
                ? "The worker is currently offline. The job will stay durable in B2 until it reconnects — nothing is lost and no provider is called."
                : "Credentials remain server-side and generation starts only after the worker claims the job."}
            </p>
            <div className="mt-4 rounded-2xl border border-slate-100 bg-cream p-4">
              <MetaLabel>Bounded public capacity</MetaLabel>
              <p className="text-[13px] leading-relaxed text-slate-600">
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
