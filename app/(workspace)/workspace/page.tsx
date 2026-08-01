"use client";

import Link from "next/link";
import { dateLabel, shortHash } from "../../../lib/format";
import { MediaCompare } from "../_components/media-compare";
import {
  buttonClass,
  Chip,
  DataList,
  MetaLabel,
  PageHeader,
  Panel,
} from "../_components/ui";
import { useWorkspace } from "../_components/workspace-data";

const evidenceLinks = [
  {
    body: "Drift bands, the three measured segments, and the verified red-to-green correction archive.",
    href: "/workspace/timing",
    label: "Timing QA",
  },
  {
    body: "The stored authorization record, plus a live test of the allow/block boundary.",
    href: "/workspace/voice",
    label: "Voice authorization",
  },
  {
    body: "Every job-scoped object written to Backblaze B2 for this run.",
    href: "/workspace/assets",
    label: "B2 assets",
  },
  {
    body: "Nine canonical Genblaze manifests with run IDs and hashes.",
    href: "/workspace/provenance",
    label: "Provenance",
  },
];

export default function OverviewPage() {
  const { connection, run } = useWorkspace();

  const metrics = [
    {
      detail: "German · complete engine path",
      label: "Editions",
      value: "1",
    },
    {
      detail: "2 padded · 1 bounded tempo-fit",
      label: "Timing QA",
      value: `${run.timing.segments.length} segments`,
    },
    {
      detail: "Source lineage · attempts · final",
      label: "B2 job objects",
      value: String(run.b2ObjectCount),
    },
    {
      detail: "Every production run verified",
      label: "Manifests",
      value: `${run.manifests.length}/9`,
    },
  ];

  return (
    <div className="flex flex-col gap-7 md:gap-8">
      <PageHeader
        actions={
          <>
            <Link
              className={buttonClass("secondary")}
              href="/workspace/editions"
            >
              Compare editions
            </Link>
            <Link className={buttonClass("primary")} href="/workspace/new">
              Start your own
            </Link>
          </>
        }
        description="A completed English-to-German run kept as a reference. Three timed segments, authorized synthetic speech, measured drift, bounded tempo-fit, captions, composition, and verified B2 output — the same path your own upload takes."
        eyebrow="Example project"
        title={run.project.title}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Chip>{run.job.version}</Chip>
        <Chip tone="amber">
          {run.project.developmentSample
            ? "Controlled engine sample"
            : "Final source"}
        </Chip>
        <Chip tone={connection === "live" ? "green" : "neutral"}>
          {connection === "live" ? "Live B2 records" : "Stored snapshot"}
        </Chip>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <MediaCompare />

        <Panel eyebrow="Voice control" title="ElevenLabs stock voice">
          <DataList
            items={[
              ["Voice type", run.authorization.voiceType],
              ["Approved use", run.authorization.allowedPurposes.join(" · ")],
              ["Languages", run.authorization.allowedLanguages.join(" · ")],
              ["Valid through", dateLabel(run.authorization.expiresAt)],
              ["Evidence hash", shortHash(run.authorization.evidenceSha256)],
              ["Approved by", run.authorization.approvedBy],
            ]}
          />

          <div className="mt-5 rounded-2xl border border-slate-100 bg-cream p-4">
            <MetaLabel>Synthetic voice disclosure</MetaLabel>
            <p className="text-body text-slate-600">
              {run.authorization.disclosure}
            </p>
          </div>

          <Link
            className={`${buttonClass("secondary")} mt-5 w-full`}
            href="/workspace/voice"
          >
            Test authorization boundary →
          </Link>
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div
            className="rounded-card border border-slate-200/70 bg-white p-4 shadow-sm sm:p-5"
            key={metric.label}
          >
            <MetaLabel>{metric.label}</MetaLabel>
            <strong className="block text-xl font-bold leading-tight text-ink sm:text-2xl">
              {metric.value}
            </strong>
            <small className="mt-1 block text-caption text-slate-500">
              {metric.detail}
            </small>
          </div>
        ))}
      </div>

      <Panel
        actions={
          <span className="font-mono text-caption text-slate-500">
            {run.job.id}
          </span>
        }
        eyebrow="Production run"
        footer={
          <p className="text-caption text-slate-500">
            {run.manifests.length} Genblaze runs · Backblaze B2 system of record
          </p>
        }
        title="Localization pipeline"
      >
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {run.pipeline.map((stage, index) => (
            <li
              className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-cream/60 p-4"
              key={stage.name}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-micro font-bold ${
                  stage.state === "done"
                    ? "bg-fit-green text-white"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {stage.state === "done"
                  ? "✓"
                  : String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <strong className="block text-body font-semibold text-ink">
                  {stage.name}
                </strong>
                <small className="text-caption text-slate-500">
                  {stage.detail}
                </small>
              </span>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel eyebrow="Quality and lineage" title="Evidence for this project">
        <div className="grid gap-3 sm:grid-cols-2">
          {evidenceLinks.map((link) => (
            <Link
              className="group rounded-2xl border border-slate-100 bg-cream/60 p-5 transition-colors hover:border-slate-200 hover:bg-white"
              href={link.href}
              key={link.href}
            >
              <strong className="flex items-center justify-between gap-2 text-[15px] font-bold text-ink">
                {link.label}
                <span
                  aria-hidden="true"
                  className="text-slate-400 transition-transform group-hover:translate-x-0.5"
                >
                  →
                </span>
              </strong>
              <p className="mt-1.5 text-caption leading-relaxed text-slate-600">
                {link.body}
              </p>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
