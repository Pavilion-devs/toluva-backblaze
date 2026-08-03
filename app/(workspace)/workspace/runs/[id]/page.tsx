"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  dateLabel,
  megabytes,
  percent,
  readableAction,
  seconds,
} from "../../../../../lib/format";
import {
  MAX_TTS_CALLS_PER_JOB,
  MAX_TTS_CHARACTERS_PER_JOB,
} from "../../../../../lib/job-contract";
import {
  buttonClass,
  Chip,
  EmptyState,
  Hash,
  MetaLabel,
  PageHeader,
  Panel,
  Spinner,
} from "../../../_components/ui";
import {
  JobProgressSummary,
  jobStateLabel,
  jobStateTone,
  StageTimeline,
} from "../../../_components/job-progress";
import {
  useWorkspace,
  type ActiveJob,
} from "../../../_components/workspace-data";

type ReviewState = "idle" | "submitting" | "recorded" | "error";

function Signals({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="mb-5 grid gap-4 rounded-2xl border border-slate-100 bg-cream/60 p-4 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div className="min-w-0" key={label}>
          <MetaLabel>{label}</MetaLabel>
          <strong className="block break-words text-caption font-semibold text-ink">
            {value}
          </strong>
        </div>
      ))}
    </div>
  );
}

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const { activeJob, adoptJob, setNotice, statusWarning, workerConnection } =
    useWorkspace();

  const [correctedTranscript, setCorrectedTranscript] = useState("");
  const [transcriptState, setTranscriptState] = useState<ReviewState>("idle");
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [revised, setRevised] = useState<{
    handle: string;
    value: string;
  } | null>(null);
  const [timingState, setTimingState] = useState<ReviewState>("idle");
  const [timingError, setTimingError] = useState<string | null>(null);

  if (!activeJob || activeJob.jobId !== params.id) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          description="Durable job pointers are held per browser session. This one is not tracked here."
          eyebrow="Run detail"
          title="Job not tracked in this session"
        />
        <EmptyState
          action={
            <Link
              className={`${buttonClass("primary")} mt-2`}
              href="/workspace/runs"
            >
              Back to runs
            </Link>
          }
          description="The B2 record is still durable. Reopen the job from the browser session that queued it, or inspect the completed engine proof instead."
          title="No matching job pointer"
        />
      </div>
    );
  }

  const job: ActiveJob = activeJob;
  const transcriptValue =
    correctedTranscript || job.transcriptReview?.detectedText || "";
  const timingHandle = job.timingReview
    ? `${job.timingReview.segmentId}:${job.timingReview.attemptNumber}`
    : null;
  const timingValue =
    revised?.handle === timingHandle
      ? revised.value
      : job.timingReview?.currentTranslation || "";

  async function approveTranscript() {
    if (!job.transcriptReview) return;
    setTranscriptState("submitting");
    setTranscriptError(null);
    try {
      const response = await fetch("/api/transcript-review", {
        body: JSON.stringify({
          correctedText: transcriptValue,
          jobId: job.jobId,
          projectId: job.projectId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        job?: Omit<ActiveJob, "statusUrl">;
        message?: string;
        ok?: boolean;
      };
      if (!response.ok || !payload.ok || !payload.job) {
        throw new Error(payload.message ?? "transcript_review_failed");
      }
      adoptJob({ ...payload.job, statusUrl: job.statusUrl });
      setRevised(null);
      setTranscriptState("recorded");
      setNotice(
        "Transcript correction is immutable in B2. The worker can now resume without repeating transcription.",
      );
    } catch (error) {
      setTranscriptState("error");
      setTranscriptError(
        error instanceof Error
          ? error.message
          : "The transcript review could not be recorded.",
      );
    }
  }

  async function approveTiming() {
    if (!job.timingReview) return;
    setTimingState("submitting");
    setTimingError(null);
    try {
      const response = await fetch("/api/timing-review", {
        body: JSON.stringify({
          jobId: job.jobId,
          projectId: job.projectId,
          revisedText: timingValue,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        job?: Omit<ActiveJob, "statusUrl">;
        message?: string;
        ok?: boolean;
      };
      if (!response.ok || !payload.ok || !payload.job) {
        throw new Error(payload.message ?? "timing_review_failed");
      }
      adoptJob({ ...payload.job, statusUrl: job.statusUrl });
      setRevised(null);
      setTimingState("recorded");
      setNotice(
        "The exact wording is immutable in B2. The same job can now resume from its measured speech checkpoint.",
      );
    } catch (error) {
      setTimingState("error");
      setTimingError(
        error instanceof Error
          ? error.message
          : "The timing review could not be recorded.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        actions={
          <Chip
            pulse={job.state === "queued" || job.state === "running"}
            tone={jobStateTone[job.state] ?? "neutral"}
          >
            {jobStateLabel[job.state] ?? job.state}
          </Chip>
        }
        description={`English → German · queued ${dateLabel(job.request.created_at)} · ${megabytes(job.request.source_size_bytes)}`}
        eyebrow="Durable B2 job"
        title={job.request.source_filename}
      />

      <Panel eyebrow="Progress" title="Localization run">
        <JobProgressSummary eventCount={job.events.length} state={job.state} />
      </Panel>

      <Panel
        eyebrow="Append-only"
        footer={
          <div className="flex flex-col gap-1.5">
            <p className="flex items-center gap-2 text-caption text-slate-500">
              {job.state === "queued" || job.state === "running" ? (
                <>
                  <Spinner className="h-3.5 w-3.5" />
                  Polling append-only B2 stage records every 20 seconds.
                </>
              ) : job.finalAvailable ? (
                "Final record is available in B2."
              ) : (
                "This job is no longer advancing; its records remain durable."
              )}
            </p>
            {(statusWarning ||
              (job.state === "queued" && workerConnection === "offline")) && (
              <p className="text-caption font-semibold text-fit-amber">
                {statusWarning ??
                  "Worker is offline; this job will remain safely queued."}
              </p>
            )}
          </div>
        }
        title="Stage events"
      >
        <StageTimeline events={job.events} state={job.state} />
      </Panel>

      {job.state === "blocked" && job.transcriptReview && (
        <Panel
          actions={<Chip tone="green">No TTS spend</Chip>}
          eyebrow="Pre-TTS quality gate"
          title="Transcript needs human review"
        >
          <p className="mb-5 text-body leading-relaxed text-slate-600">
            Toluva stopped before translation and ElevenLabs. The original
            provider transcript remains immutable; an approved correction is
            stored as a separate B2 record.
          </p>
          <Signals
            items={[
              [
                "Reason",
                job.transcriptReview.reasonCodes.map(readableAction).join(", "),
              ],
              [
                "Mean confidence",
                job.transcriptReview.meanWordConfidence === null
                  ? "Unavailable"
                  : percent(job.transcriptReview.meanWordConfidence),
              ],
              ["Trailing evidence", job.transcriptReview.trailingText],
            ]}
          />
          <label className="block">
            <span className="mb-1.5 block text-body font-semibold text-slate-700">
              Correct transcript
            </span>
            <textarea
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-body text-ink"
              disabled={transcriptState === "submitting"}
              onChange={(event) => setCorrectedTranscript(event.target.value)}
              rows={3}
              value={transcriptValue}
            />
            <small className="mt-1.5 block text-caption text-slate-500">
              Keep “Toluva” exact and remove unresolved trailing fragments.
              Approval resumes this same job.
            </small>
          </label>
          {transcriptError && (
            <p className="mt-3 text-body font-semibold text-fit-red">
              {transcriptError}
            </p>
          )}
          <button
            className={`${buttonClass("primary")} mt-5`}
            disabled={
              transcriptState === "submitting" ||
              transcriptValue.trim().length === 0
            }
            onClick={() => void approveTranscript()}
          >
            {transcriptState === "submitting"
              ? "Writing immutable review…"
              : "Approve correction and resume"}
          </button>
        </Panel>
      )}

      {job.state === "blocked" && job.timingReview && (
        <Panel
          actions={<Chip tone="green">No TTS spend yet</Chip>}
          eyebrow="Timing-drift gate"
          title="Translation revision needs approval"
        >
          <p className="mb-5 text-body leading-relaxed text-slate-600">
            Toluva preserved the measured speech attempt and stopped before
            another ElevenLabs call. An exact, hash-bound translation revision
            must be approved before this same job can resume.
          </p>
          <Signals
            items={[
              [
                "Segment",
                `${job.timingReview.segmentId} · attempt ${job.timingReview.attemptNumber}`,
              ],
              ["Target", `${job.timingReview.targetSeconds.toFixed(2)}s`],
              [
                "Required action",
                readableAction(job.timingReview.requestedAction),
              ],
            ]}
          />
          <label className="block">
            <span className="mb-1.5 block text-body font-semibold text-slate-700">
              Approved German wording
            </span>
            <textarea
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-body text-ink"
              disabled={timingState === "submitting"}
              onChange={(event) =>
                setRevised({
                  handle: timingHandle ?? "",
                  value: event.target.value,
                })
              }
              rows={3}
              value={timingValue}
            />
            <small className="mt-1.5 block text-caption text-slate-500">
              {job.timingReview.instruction}
              {job.timingReview.protectedTerms.length > 0 && (
                <>
                  {" "}Keep{" "}
                  {job.timingReview.protectedTerms
                    .map((term) => `“${term}”`)
                    .join(", ")}{" "}
                  exact.
                </>
              )}
            </small>
          </label>
          {timingError && (
            <p className="mt-3 text-body font-semibold text-fit-red">
              {timingError}
            </p>
          )}
          <button
            className={`${buttonClass("primary")} mt-5`}
            disabled={
              timingState === "submitting" ||
              timingValue.trim().length === 0 ||
              timingValue.trim() ===
                job.timingReview.currentTranslation.trim()
            }
            onClick={() => void approveTiming()}
          >
            {timingState === "submitting"
              ? "Binding exact revision…"
              : "Approve wording and resume"}
          </button>
        </Panel>
      )}

      {job.state === "blocked" &&
        !job.transcriptReview &&
        !job.timingReview && (
          <Panel
            actions={<Chip tone="amber">Stopped safely</Chip>}
            eyebrow="Governed review gate"
            title="Review details are unavailable"
          >
            <p className="text-body leading-relaxed text-slate-600">
              The job remains durably blocked in B2. No provider retry will run
              until its exact review record is available.
            </p>
          </Panel>
        )}

      {job.finalAvailable && (
        <Panel
          actions={<Chip tone="green">Ready to review</Chip>}
          eyebrow="Completed localization"
          title="Your German edition is ready"
        >
          {job.finalSummary && (
            <>
              <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ResultMetric
                  detail={`of ${MAX_TTS_CALLS_PER_JOB} allowed`}
                  label="Speech calls"
                  value={String(job.finalSummary.ttsAttemptCount)}
                />
                <ResultMetric
                  detail={`of ${MAX_TTS_CHARACTERS_PER_JOB} allowed`}
                  label="Generated text"
                  value={`${job.finalSummary.ttsGeneratedCharacters} chars`}
                />
                <ResultMetric
                  detail="sentence-aligned slots"
                  label="Timed segments"
                  value={String(job.finalSummary.segmentCount)}
                />
                <ResultMetric
                  detail={
                    job.finalSummary.localTempoFactor
                      ? "approved local fit"
                      : readableAction(job.finalSummary.timingAction)
                  }
                  label="Timing fit"
                  value={
                    job.finalSummary.localTempoFactor
                      ? `${job.finalSummary.localTempoFactor.toFixed(4)}×`
                      : job.finalSummary.timingBand
                  }
                />
              </div>

              <div className="mb-5 grid gap-3 rounded-2xl border border-fit-green/20 bg-fit-green-soft/55 p-4 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <strong className="block text-body font-semibold text-ink">
                    Voice authorized · timing measured · final stored in B2
                  </strong>
                  <p className="mt-1 text-caption text-slate-600">
                    {job.finalSummary.captionsEmbedded
                      ? "German captions are embedded and available as WebVTT."
                      : "German captions are available as a WebVTT sidecar."}{" "}
                    Final duration {seconds(job.finalSummary.finalDurationSeconds)}.
                  </p>
                </div>
                <Chip tone="green">
                  {readableAction(job.finalSummary.authorizationCode)}
                </Chip>
              </div>
            </>
          )}

          <p className="mb-4 text-body text-slate-500">
            This player and both downloads resolve only from this job&apos;s
            immutable final record.
          </p>
          <video
            className="localized-player aspect-video w-full rounded-2xl bg-ink"
            controls
            preload="metadata"
            src={`/api/job-media?project=${job.projectId}&job=${job.jobId}&kind=final`}
          >
            <track
              default
              kind="captions"
              label="Deutsch"
              src={`/api/job-media?project=${job.projectId}&job=${job.jobId}&kind=captions`}
              srcLang="de"
            />
          </video>

          <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-slate-100 bg-cream/55 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <MetaLabel>Verified final SHA-256</MetaLabel>
              {job.finalSummary ? (
                <Hash value={job.finalSummary.finalSha256} />
              ) : (
                <p className="text-caption text-slate-500">
                  The immutable final record is available in B2.
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <a
                className={buttonClass("secondary")}
                download={`${job.jobId}-de.vtt`}
                href={`/api/job-media?project=${job.projectId}&job=${job.jobId}&kind=captions`}
              >
                Download captions
              </a>
              <a
                className={buttonClass("primary")}
                download={`${job.jobId}-de.mp4`}
                href={`/api/job-media?project=${job.projectId}&job=${job.jobId}&kind=final`}
              >
                Download German MP4
              </a>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

function ResultMetric({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-cream/60 p-4">
      <MetaLabel>{label}</MetaLabel>
      <strong className="block font-mono text-lg font-semibold tabular-nums text-ink">
        {value}
      </strong>
      <span className="mt-1 block text-caption text-slate-500">{detail}</span>
    </div>
  );
}
