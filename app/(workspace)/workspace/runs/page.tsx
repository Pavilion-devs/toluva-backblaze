"use client";

import Link from "next/link";
import { dateLabel, megabytes, seconds } from "../../../../lib/format";
import {
  buttonClass,
  Chip,
  MetaLabel,
  PageHeader,
  Panel,
} from "../../_components/ui";
import {
  jobStateLabel,
  jobStateTone,
} from "../../_components/job-progress";
import { useWorkspace } from "../../_components/workspace-data";

export default function RunsPage() {
  const { activeJob, run } = useWorkspace();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        actions={
          <Link className={buttonClass("primary")} href="/workspace/new">
            New localization
          </Link>
        }
        description="Your current durable job plus a completed reference project. This browser keeps only an opaque job pointer; Backblaze B2 remains the durable record."
        eyebrow="History"
        title="Runs"
      />

      <Panel eyebrow="Reference" title="Completed example project">
        <Link
          className="group flex flex-wrap items-center gap-4 rounded-2xl border border-fit-green/25 bg-fit-green-soft p-4 transition-colors hover:border-fit-green/40"
          href="/workspace"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fit-green font-mono text-caption font-bold text-white">
            DE
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block font-display text-[15px] text-ink">
              {run.project.title}
            </strong>
            <small className="block font-mono text-caption text-slate-600">
              {run.job.id}
            </small>
          </span>
          <span className="text-right">
            <Chip tone="green">Completed</Chip>
            <small className="mt-1 block text-caption text-slate-600">
              {seconds(run.edition.finalDurationSeconds)} ·{" "}
              {run.manifests.length} manifests
            </small>
          </span>
          <span
            aria-hidden="true"
            className="text-slate-500 transition-transform group-hover:translate-x-0.5"
          >
            →
          </span>
        </Link>
      </Panel>

      <Panel eyebrow="This browser" title="Tracked durable job">
        {activeJob ? (
          <Link
            className="group flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-cream/60 p-4 transition-colors hover:bg-white"
            href={`/workspace/runs/${encodeURIComponent(activeJob.jobId)}`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-200 font-mono text-caption font-bold text-slate-600">
              {activeJob.request.target_language.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate font-display text-[15px] text-ink">
                {activeJob.request.source_filename}
              </strong>
              <small className="block font-mono text-caption text-slate-600">
                {activeJob.jobId}
              </small>
            </span>
            <span className="text-right">
              <Chip
                pulse={
                  activeJob.state === "queued" || activeJob.state === "running"
                }
                tone={jobStateTone[activeJob.state] ?? "neutral"}
              >
                {jobStateLabel[activeJob.state] ?? activeJob.state}
              </Chip>
              <small className="mt-1 block text-caption text-slate-600">
                {megabytes(activeJob.request.source_size_bytes)} ·{" "}
                {dateLabel(activeJob.request.created_at)}
              </small>
            </span>
            <span
              aria-hidden="true"
              className="text-slate-500 transition-transform group-hover:translate-x-0.5"
            >
              →
            </span>
          </Link>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-cream/60 px-6 py-10 text-center">
            <MetaLabel>No tracked job</MetaLabel>
            <p className="mx-auto max-w-md text-body leading-relaxed text-slate-600">
              Queue a localization and its durable B2 job will appear here while
              this browser session tracks it.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}
