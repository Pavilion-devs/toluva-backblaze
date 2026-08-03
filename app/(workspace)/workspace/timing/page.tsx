"use client";

import { percent, seconds, shortHash, timestamp } from "../../../../lib/format";
import {
  bandChip,
  bandDot,
  Chip,
  MetaLabel,
  PageHeader,
  Panel,
  ScrollArea,
} from "../../_components/ui";
import { useWorkspace } from "../../_components/workspace-data";

const bands = [
  { label: "≤ 8% fit", tone: "green" as const },
  { label: "8–15% pad or review", tone: "amber" as const },
  { label: "> 15% retry", tone: "red" as const },
];

export default function TimingPage() {
  const { run } = useWorkspace();
  const proof = run.timingCorrectionProof;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description="Every translated segment is measured against its source slot. Drift outside the band triggers padding, a bounded tempo fit, or a blocked retry that waits for approved wording."
        eyebrow="Quality control"
        title="Timing QA"
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-card border border-slate-200/70 bg-white px-5 py-4 shadow-sm sm:px-6">
        <span className="text-label font-bold uppercase tracking-[0.14em] text-slate-500">
          Drift bands
        </span>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {bands.map((band) => (
            <span
              className="flex items-center gap-2 text-caption font-medium text-slate-600"
              key={band.label}
            >
              <i className={`h-2.5 w-2.5 rounded-full ${bandDot[band.tone]}`} />
              {band.label}
            </span>
          ))}
        </div>
      </div>

      <Panel
        actions={<Chip tone="green">B2 verified archive</Chip>}
        eyebrow="Correction archive"
        title="Measured red → approved rewrite → verified green"
      >
        <p className="mb-6 text-body leading-relaxed text-slate-600">
          One German attempt overran a {seconds(proof.slotSeconds)} source slot.
          Toluva measured it, blocked the next billable call, and resumed only
          after a hash-bound human-approved shorter revision appeared in B2.
          Both attempts, both manifests, and the parent/child run relationship
          remain inspectable.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {proof.attempts.map((attempt) => (
            <article
              className={`rounded-2xl border p-5 ${bandChip[attempt.band]}`}
              key={attempt.attemptNumber}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-label font-bold uppercase tracking-widest opacity-80">
                  Attempt {attempt.attemptNumber}
                </span>
                <strong className="font-display text-body font-bold uppercase">
                  {attempt.band}
                </strong>
              </div>
              <p className="mb-4 text-body leading-relaxed text-ink">
                {attempt.translatedText}
              </p>
              <dl className="mb-4 grid grid-cols-3 gap-2 border-t border-current/15 pt-3">
                {[
                  ["Generated", seconds(attempt.generatedSeconds)],
                  ["Slot", seconds(proof.slotSeconds)],
                  ["Drift", percent(attempt.driftRatio)],
                ].map(([term, value]) => (
                  <div key={term}>
                    <dt className="text-label font-bold uppercase tracking-wide opacity-70">
                      {term}
                    </dt>
                    <dd className="font-mono text-body font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
              <audio
                aria-label={`Correction attempt ${attempt.attemptNumber}`}
                className="w-full"
                controls
                preload="none"
                src={`/api/correction-audio?attempt=${attempt.attemptNumber}`}
              />
              <small className="mt-2 block text-micro opacity-80">
                Run {shortHash(attempt.runId, 8, 5)} · manifest and stored bytes
                verified
              </small>
            </article>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-cream p-4">
          <div>
            <MetaLabel>Genblaze parent/child lineage</MetaLabel>
            <code className="font-mono text-body text-ink">
              {shortHash(proof.attempts[0].runId, 8, 5)}
              {" → "}
              {shortHash(proof.attempts[1].runId, 8, 5)}
            </code>
          </div>
          <strong className="text-body font-semibold text-slate-700">
            Protected term {proof.protectedTerms.join(", ")} preserved
          </strong>
        </div>
      </Panel>

      <Panel
        actions={
          <span className="text-caption font-medium text-slate-500">
            {run.timing.attemptCount} TTS calls ·{" "}
            {run.timing.generatedCharacters} chars
          </span>
        }
        eyebrow="German timing report"
        footer={
          <div>
            <strong className="block text-body font-bold text-ink">
              Source timing preserved with measured correction
            </strong>
            <p className="mt-1 text-caption leading-relaxed text-slate-600">
              Segments 1 and 3 kept their natural delivery and received silence
              padding. Segment 2 ran 4.49% long, so the audio fan-in applied a
              bounded 1.0449× tempo fit. No extra TTS call was needed, and every
              segment still lands on its original boundary.
            </p>
          </div>
        }
        title={`${run.timing.segments.length} measured segments`}
      >
        {/* Card layout below md; the six-column table needs the width. */}
        <div className="flex flex-col gap-3 md:hidden">
          {run.timing.segments.map((segment) => (
            <article
              className="rounded-2xl border border-slate-100 bg-cream/60 p-4"
              key={segment.id}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <strong className="font-mono text-caption text-ink">
                  {segment.id}
                </strong>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-caption font-bold ${bandChip[segment.band]}`}
                >
                  {percent(segment.driftRatio)}
                </span>
              </div>
              <p className="text-caption text-slate-500">
                {segment.sourceText}
              </p>
              <p className="mt-1 text-body font-medium text-ink">
                {segment.translatedText}
              </p>
              <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-200/70 pt-3">
                {[
                  ["Slot", seconds(segment.endSeconds - segment.startSeconds)],
                  ["Generated", seconds(segment.generatedSeconds)],
                  ["Final", seconds(segment.finalSeconds)],
                ].map(([term, value]) => (
                  <div key={term}>
                    <dt className="text-label font-bold uppercase tracking-wide text-slate-400">
                      {term}
                    </dt>
                    <dd className="font-mono text-caption text-slate-700">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>

        <ScrollArea className="-mx-5 hidden sm:-mx-6 md:-mx-8 md:block">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 text-label font-bold uppercase tracking-wider text-slate-400">
                <th className="px-6 pb-3 font-bold md:px-8">Segment</th>
                <th className="px-3 pb-3 font-bold">
                  Source / final translation
                </th>
                <th className="px-3 pb-3 text-right font-bold">Slot</th>
                <th className="px-3 pb-3 text-right font-bold">Generated</th>
                <th className="px-3 pb-3 text-right font-bold">Final</th>
                <th className="px-6 pb-3 text-right font-bold md:px-8">
                  Drift
                </th>
              </tr>
            </thead>
            <tbody>
              {run.timing.segments.map((segment) => (
                <tr
                  className="border-b border-slate-50 align-top last:border-b-0"
                  key={segment.id}
                >
                  <td className="px-6 py-4 md:px-8">
                    <strong className="block font-mono text-caption text-ink">
                      {segment.id}
                    </strong>
                    <small className="font-mono text-micro text-slate-500">
                      {timestamp(segment.startSeconds)} –{" "}
                      {timestamp(segment.endSeconds)}
                    </small>
                  </td>
                  <td className="max-w-md px-3 py-4">
                    <small className="block text-caption text-slate-500">
                      {segment.sourceText}
                    </small>
                    <strong className="mt-1 block text-caption font-medium text-ink">
                      {segment.translatedText}
                    </strong>
                  </td>
                  <td className="px-3 py-4 text-right font-mono text-caption text-slate-600">
                    {seconds(segment.endSeconds - segment.startSeconds)}
                  </td>
                  <td className="px-3 py-4 text-right font-mono text-caption text-slate-600">
                    {seconds(segment.generatedSeconds)}
                  </td>
                  <td className="px-3 py-4 text-right font-mono text-caption text-slate-600">
                    {seconds(segment.finalSeconds)}
                  </td>
                  <td className="px-6 py-4 text-right md:px-8">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-caption font-bold ${bandChip[segment.band]}`}
                      title={
                        segment.tempoFactor > 1.000001
                          ? `${segment.tempoFactor.toFixed(4)}× bounded tempo-fit`
                          : `${segment.attemptCount} explicit TTS attempt`
                      }
                    >
                      {percent(segment.driftRatio)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </Panel>
    </div>
  );
}
