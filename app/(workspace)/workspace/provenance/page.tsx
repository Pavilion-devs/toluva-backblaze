"use client";

import { dateLabel, shortHash } from "../../../../lib/format";
import { Chip, Hash, MetaLabel, PageHeader, Panel } from "../../_components/ui";
import { useWorkspace } from "../../_components/workspace-data";

export default function ProvenancePage() {
  const { run } = useWorkspace();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description="Genblaze owns the visible generative-media orchestration. Every stage is a separate run with its own canonical manifest, and Toluva independently re-checks stored media hashes before describing bytes as verified."
        eyebrow="Lineage"
        title="Provenance"
      />

      <Panel
        actions={<Chip tone="green">{run.manifests.length} / 9 valid</Chip>}
        eyebrow="Canonical manifests"
        title={`${run.manifests.length} manifests verified`}
      >
        <p className="mb-5 text-body leading-relaxed text-slate-600">
          Transcription, three translations, three speech runs, the
          source-timed audio fan-in, and the final composition — all loaded
          from B2.
        </p>

        <div className="flex flex-col gap-2">
          {run.manifests.map((manifest) => (
            <article
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-100 bg-cream/60 p-4"
              key={manifest.runId}
            >
              <div className="min-w-[180px] flex-1">
                <MetaLabel>{manifest.stage}</MetaLabel>
                <strong className="block text-body font-semibold text-ink">
                  {manifest.provider}
                </strong>
                <small className="text-caption text-slate-500">
                  {manifest.model}
                </small>
              </div>
              <div className="min-w-[130px]">
                <MetaLabel>Run</MetaLabel>
                <code className="font-mono text-caption text-slate-700">
                  {shortHash(manifest.runId, 8, 5)}
                </code>
              </div>
              <div className="min-w-[150px]">
                <MetaLabel>Canonical hash</MetaLabel>
                <code className="font-mono text-caption text-slate-700">
                  {shortHash(manifest.canonicalHash)}
                </code>
              </div>
              <span
                aria-label="verified"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fit-green text-body font-bold text-white"
              >
                ✓
              </span>
            </article>
          ))}
        </div>

        <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
          <div>
            <dt className="mb-1 text-body text-slate-500">
              Final output hash
            </dt>
            <dd>
              <Hash value={run.edition.finalSha256} />
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-body text-slate-500">Protected term</dt>
            <dd className="font-mono text-caption text-slate-700">
              {run.edition.protectedTerms.join(", ")} · preserved
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-body text-slate-500">Captions</dt>
            <dd className="font-mono text-caption text-slate-700">
              {run.edition.captionsEmbedded
                ? "WebVTT + embedded mov_text"
                : "WebVTT sidecar"}
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-body text-slate-500">
              Last engine event
            </dt>
            <dd className="font-mono text-caption text-slate-700">
              {dateLabel(run.syncedAt)}
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel eyebrow="Scope of the claim" title="What a manifest does not prove">
        <p className="text-body leading-relaxed text-slate-600">
          A manifest proves recorded lineage and canonical integrity. It does
          not prove every supplied fact, and it does not guarantee regulatory
          compliance. Failed attempts and superseded stage records stay in the
          audit trail rather than being replaced.
        </p>
      </Panel>
    </div>
  );
}
